from __future__ import annotations

import json
import os
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import asyncio
import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import time as _time
import random as _random


CONFIG_BASENAME = "emotion_config.json"


def _select_device(explicit: Optional[str] = None) -> torch.device:
    if explicit:
        return torch.device(explicit)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


@dataclass
class EmotionConfig:
    labels: List[str]
    temperature: List[float]
    thresholds: List[float]
    # Optional projections for VA from hidden CLS
    proj_W: Optional[np.ndarray] = None  # shape (2, hidden_dim)
    proj_b: Optional[np.ndarray] = None  # shape (2,)
    # Optional shallow mapping from probabilities if hidden not available
    prob_W: Optional[np.ndarray] = None  # shape (2, num_labels)
    prob_b: Optional[np.ndarray] = None  # shape (2,)

    @staticmethod
    def load(
        *,
        model_labels: List[str],
        config_path: Optional[str] = None,
    ) -> "EmotionConfig":
        # Resolve config path
        path: Optional[Path] = None
        if config_path:
            path = Path(config_path)
        else:
            path = Path(__file__).with_name(CONFIG_BASENAME)

        labels = list(model_labels)
        temperature = [1.0 for _ in labels]
        thresholds = [0.5 for _ in labels]
        proj_W: Optional[np.ndarray] = None
        proj_b: Optional[np.ndarray] = None
        prob_W: Optional[np.ndarray] = None
        prob_b: Optional[np.ndarray] = None

        try:
            if path.exists():
                with path.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                # Allow label remap from file if provided; else stick to model labels
                if isinstance(data.get("labels"), list) and data["labels"]:
                    labels = [str(x) for x in data["labels"]]
                if isinstance(data.get("temperature"), list):
                    temperature = [float(x) for x in data["temperature"]]
                if isinstance(data.get("thresholds"), list):
                    thresholds = [float(x) for x in data["thresholds"]]
                if "proj_W" in data:
                    W = np.array(data["proj_W"], dtype=np.float32)
                    if W.ndim == 2 and W.shape[0] == 2:
                        proj_W = W
                if "proj_b" in data:
                    b = np.array(data["proj_b"], dtype=np.float32)
                    proj_b = b.reshape(2,) if b.size >= 2 else None
                if "prob_W" in data:
                    pW = np.array(data["prob_W"], dtype=np.float32)
                    if pW.ndim == 2 and pW.shape[0] == 2:
                        prob_W = pW
                if "prob_b" in data:
                    pb = np.array(data["prob_b"], dtype=np.float32)
                    prob_b = pb.reshape(2,) if pb.size >= 2 else None
        except Exception:
            # Fall back to defaults silently
            pass

        # Normalize vector lengths to num labels
        n = len(labels)
        if len(temperature) != n:
            if len(temperature) == 1:
                temperature = [float(temperature[0])] * n
            else:
                temperature = [1.0] * n
        if len(thresholds) != n:
            if len(thresholds) == 1:
                thresholds = [float(thresholds[0])] * n
            else:
                thresholds = [0.5] * n

        # Ensure prob_W has matching width if provided; else drop
        if prob_W is not None and prob_W.shape[1] != n:
            prob_W = None

        return EmotionConfig(
            labels=labels,
            temperature=temperature,
            thresholds=thresholds,
            proj_W=proj_W,
            proj_b=proj_b,
            prob_W=prob_W,
            prob_b=prob_b,
        )


class EmotionBrain:
    """
    Production-grade multi-label emotion head with calibrated probabilities
    and continuous Valence/Arousal in [-1, 1].
    - No keyword or regex fallbacks.
    - Temperature scaling and per-class thresholds loaded from JSON config if present.
    """

    def __init__(
        self,
        model_id: Optional[str] = None,
        device: Optional[str] = None,
        config_path: Optional[str] = None,
    ) -> None:
        resolved_model = model_id or os.getenv("EMOTION_MODEL_ID") or "SamLowe/roberta-base-go_emotions"
        # Honor override device via env
        device_override = os.getenv("EMOTION_DEVICE") or device
        self.device = _select_device(device_override)
        self.tokenizer = AutoTokenizer.from_pretrained(resolved_model)
        self.model = AutoModelForSequenceClassification.from_pretrained(resolved_model)
        self.model.to(self.device)
        self.model.eval()

        # Infer labels if config is absent
        id2label = getattr(self.model.config, "id2label", None) or {}
        model_labels: List[str] = []
        if isinstance(id2label, dict) and id2label:
            # sort by index if keys are ints or digit strings
            try:
                pairs = sorted(((int(k), v) for k, v in id2label.items()), key=lambda t: t[0])
                model_labels = [str(v) for _, v in pairs]
            except Exception:
                model_labels = [str(v) for v in id2label.values()]
        else:
            # Fallback: generic label names
            n = int(getattr(self.model.config, "num_labels", 0) or 0)
            model_labels = [f"LABEL_{i}" for i in range(n)]

        self.config = EmotionConfig.load(model_labels=model_labels, config_path=config_path)
        # Optional environment calibration overrides (label -> temperature/threshold)
        try:
            raw = os.getenv("EMOTION_CALIB_JSON") or ""
            if raw.strip():
                data = json.loads(raw)
                if isinstance(data, dict):
                    tmap = data.get("temperature")
                    hmap = data.get("threshold") or data.get("thresholds")
                    if isinstance(tmap, dict):
                        m: Dict[str, float] = {}
                        for k, v in tmap.items():
                            try:
                                val = float(v)
                                # clamp 0.3..3.0
                                if val < 0.3:
                                    val = 0.3; 
                                elif val > 3.0:
                                    val = 3.0
                                m[str(k).lower()] = val
                            except Exception:
                                pass
                        self.config.temperature = [float(m.get(lbl.lower(), t)) for lbl, t in zip(self.config.labels, self.config.temperature)]
                    if isinstance(hmap, dict):
                        m2: Dict[str, float] = {}
                        for k, v in hmap.items():
                            try:
                                val = float(v)
                                # clamp 0.0..0.99
                                if val < 0.0:
                                    val = 0.0
                                elif val > 0.99:
                                    val = 0.99
                                m2[str(k).lower()] = val
                            except Exception:
                                pass
                        self.config.thresholds = [float(m2.get(lbl.lower(), h)) for lbl, h in zip(self.config.labels, self.config.thresholds)]
        except Exception:
            pass

        # Prebuild per-class temperature tensor for efficient scaling
        self._temp = torch.tensor(self.config.temperature, dtype=torch.float32, device=self.device)
        self._thresh = torch.tensor(self.config.thresholds, dtype=torch.float32, device=self.device)
        # One-time numeric-only calibration log (counts and clamps)
        try:
            numTemp = int(len(self.config.temperature))
            numThresh = int(len(self.config.thresholds))
            # we don't have direct clamp counts here; approximate by counting extremes
            clampedTemp = int(sum(1 for x in self.config.temperature if x <= 0.3 or x >= 3.0))
            clampedThresh = int(sum(1 for x in self.config.thresholds if x <= 0.0 or x >= 0.99))
            print("emotion.calib.applied", {"numTemp": numTemp, "numThresh": numThresh, "clampedTemp": clampedTemp, "clampedThresh": clampedThresh})
        except Exception:
            pass

        # Small memoization (normalized text -> result)
        self._memo_max = 1000
        self._memo = OrderedDict()

        # Async micro-batcher state
        self._batch_lock = asyncio.Lock()
        self._batch = []  # each item: {text,norm,max_len,top_k,future}
        self._flush_task = None
        self._batch_delay_sec = 0.008
        self._batch_max_items = 16

    @torch.no_grad()
    def warmup(self) -> None:
        _ = self.predict("hello", max_len=16, top_k=3)

    @torch.no_grad()
    def predict(self, text: str, max_len: int = 512, top_k: int = 5) -> Dict[str, Any]:
        # Memo check
        key = self._norm(text)
        cached = self._memo_get(key)
        if cached is not None:
            return cached

        # Tokenize with hard cap
        enc = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=max_len,
            padding=False,
        )
        enc = {k: v.to(self.device) for k, v in enc.items()}

        device_type = "cuda" if self.device.type == "cuda" else ("mps" if self.device.type == "mps" else None)
        with torch.inference_mode():
            if device_type:
                with torch.autocast(device_type=device_type):
                    out = self.model(**enc, output_hidden_states=True, return_dict=True)
            else:
                out = self.model(**enc, output_hidden_states=True, return_dict=True)
        logits = out.logits  # (1, C)

        # Per-class temperature scaling then sigmoid
        t = torch.clamp(self._temp, min=1e-3)
        scaled = logits / t
        probs_post = torch.sigmoid(scaled).squeeze(0)  # (C,)
        # Shadow pre-calibration probabilities
        probs_pre = torch.sigmoid(logits.squeeze(0))  # (C,)

        # Determine active labels using thresholds
        active = probs_post >= self._thresh

        # Build full probs map
        labels = self.config.labels
        full_map: Dict[str, float] = {labels[i]: float(probs_post[i].item()) for i in range(len(labels))}

        # Top-k sorted labels by score
        idx_sorted = torch.argsort(probs_post, descending=True).tolist()
        top = []
        for i in idx_sorted[: max(1, min(top_k, len(idx_sorted)) )]:
            top.append({"label": labels[i], "score": float(probs_post[i].item())})

        # Estimate valence/arousal
        v, a = self._estimate_va(out, probs_post)

        result = {
            "labels": top,
            "probs": full_map,
            "active": [labels[i] for i in range(len(labels)) if bool(active[i].item())],
            "valence": float(v),
            "arousal": float(a),
        }
        self._memo_put(key, result)
        # Shadow stats update (sampled)
        try:
            _shadow_maybe_update(probs_pre, probs_post, self._thresh, idx_sorted, top_k=min(10, len(idx_sorted)))
        except Exception:
            pass
        return result

    async def predict_async(self, text: str, max_len: int = 512, top_k: int = 5) -> Dict[str, Any]:
        key = self._norm(text)
        cached = self._memo_get(key)
        if cached is not None:
            return cached
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        req = {"text": text, "norm": key, "max_len": max_len, "top_k": top_k, "future": fut}
        async with self._batch_lock:
            self._batch.append(req)
            # If batch is large, flush immediately
            if len(self._batch) >= self._batch_max_items:
                if self._flush_task is None or self._flush_task.done():
                    self._flush_task = asyncio.create_task(self._drain_batch())
            else:
                # schedule delayed flush
                if self._flush_task is None or self._flush_task.done():
                    self._flush_task = asyncio.create_task(self._flush_after_delay())
        return await fut

    async def _flush_after_delay(self):
        try:
            await asyncio.sleep(self._batch_delay_sec)
            await self._drain_batch()
        except Exception:
            pass

    async def _drain_batch(self):
        async with self._batch_lock:
            items = self._batch
            self._batch = []
        if not items:
            return
        texts = [it["text"] for it in items]
        norms = [it["norm"] for it in items]
        topks = [int(it["top_k"]) for it in items]
        max_lens = [int(it["max_len"]) for it in items]
        cap = int(max(max_lens) if max_lens else 512)

        enc = self.tokenizer(
            texts,
            return_tensors="pt",
            truncation=True,
            max_length=cap,
            padding=True,
        )
        enc = {k: v.to(self.device) for k, v in enc.items()}

        device_type = "cuda" if self.device.type == "cuda" else ("mps" if self.device.type == "mps" else None)
        with torch.inference_mode():
            if device_type:
                with torch.autocast(device_type=device_type):
                    out = self.model(**enc, output_hidden_states=True, return_dict=True)
            else:
                out = self.model(**enc, output_hidden_states=True, return_dict=True)

        logits = out.logits  # (B, C)
        t = torch.clamp(self._temp, min=1e-3)  # (C,)
        scaled = logits / t
        probs_post = torch.sigmoid(scaled)  # (B, C)
        probs_pre = torch.sigmoid(logits)   # (B, C)

        labels = self.config.labels
        hidden_last = out.hidden_states[-1] if getattr(out, "hidden_states", None) is not None else None  # (B,T,D)

        results: List[Dict[str, Any]] = []
        for i in range(probs_post.shape[0]):
            p = probs_post[i]
            full_map: Dict[str, float] = {labels[j]: float(p[j].item()) for j in range(len(labels))}
            idx_sorted = torch.argsort(p, descending=True).tolist()
            tk = topks[i]
            top = [{"label": labels[j], "score": float(p[j].item())} for j in idx_sorted[: max(1, min(tk, len(idx_sorted)) )]]
            act = (p >= self._thresh).tolist()

            # VA from CLS if possible per sample
            if hidden_last is not None:
                cls = hidden_last[i, 0, :]  # (D,)
                va = self._va_from_cls(cls)
                if va is None:
                    va = self._va_from_probs(p)
            else:
                va = self._va_from_probs(p)

            res = {
                "labels": top,
                "probs": full_map,
                "active": [labels[j] for j in range(len(labels)) if bool(act[j])],
                "valence": float(va[0]),
                "arousal": float(va[1]),
            }
            results.append(res)

        # Shadow stats update (sampled)
        try:
            for i in range(probs_post.shape[0]):
                idx_sorted = torch.argsort(probs_post[i], descending=True).tolist()
                _shadow_maybe_update(probs_pre[i], probs_post[i], self._thresh, idx_sorted, top_k=min(10, len(idx_sorted)))
        except Exception:
            pass

        # Complete futures and populate memo
        for it, norm_key, res in zip(items, norms, results):
            self._memo_put(norm_key, res)
            fut = it["future"]
            if not fut.done():
                try:
                    fut.set_result(res)
                except Exception:
                    pass

    def _estimate_va(self, out, probs: torch.Tensor) -> Tuple[float, float]:
        """
        Prefer a linear projection from CLS hidden (tanh to [-1,1]).
        Fallback to shallow mapping from probabilities using config weights.
        If neither available, derive a deterministic baseline from prob stats.
        """
        # Try hidden CLS → VA
        try:
            hs = getattr(out, "hidden_states", None)
            if hs is not None and isinstance(hs, (list, tuple)) and len(hs) > 0:
                last_h = hs[-1]  # (1, T, D)
                cls = last_h[:, 0, :]  # (1, D)
                if self.config.proj_W is not None:
                    W = torch.tensor(self.config.proj_W, dtype=torch.float32, device=cls.device)  # (2, D)
                    b = torch.tensor(self.config.proj_b, dtype=torch.float32, device=cls.device) if self.config.proj_b is not None else torch.zeros(2, device=cls.device)
                    va = torch.tanh(torch.matmul(W, cls.squeeze(0)) + b)  # (2,)
                    return float(va[0].item()), float(va[1].item())
        except Exception:
            pass

        # Fallback: probs → VA via provided weights
        try:
            if self.config.prob_W is not None:
                Wp = torch.tensor(self.config.prob_W, dtype=torch.float32, device=probs.device)  # (2, C)
                bp = torch.tensor(self.config.prob_b, dtype=torch.float32, device=probs.device) if self.config.prob_b is not None else torch.zeros(2, device=probs.device)
                va = torch.tanh(torch.matmul(Wp, probs) + bp)
                return float(va[0].item()), float(va[1].item())
        except Exception:
            pass

        # Deterministic baseline
        return self._va_from_probs(probs)

    # ---- helpers: VA projections & memo ----
    def _va_from_cls(self, cls_vec: torch.Tensor) -> Optional[Tuple[float, float]]:
        try:
            if self.config.proj_W is None:
                return None
            W = torch.tensor(self.config.proj_W, dtype=torch.float32, device=cls_vec.device)
            b = torch.tensor(self.config.proj_b, dtype=torch.float32, device=cls_vec.device) if self.config.proj_b is not None else torch.zeros(2, device=cls_vec.device)
            va = torch.tanh(torch.matmul(W, cls_vec) + b)
            return float(va[0].item()), float(va[1].item())
        except Exception:
            return None

    def _va_from_probs(self, probs: torch.Tensor) -> Tuple[float, float]:
        try:
            if self.config.prob_W is not None:
                Wp = torch.tensor(self.config.prob_W, dtype=torch.float32, device=probs.device)
                bp = torch.tensor(self.config.prob_b, dtype=torch.float32, device=probs.device) if self.config.prob_b is not None else torch.zeros(2, device=probs.device)
                va = torch.tanh(torch.matmul(Wp, probs) + bp)
                return float(va[0].item()), float(va[1].item())
        except Exception:
            pass
        p = probs.detach().float()
        mean = torch.mean(p)
        std = torch.std(p) if torch.numel(p) > 1 else torch.tensor(0.0, device=p.device)
        valence = torch.clamp(2.0 * (mean - 0.5), min=-1.0, max=1.0)
        arousal = torch.clamp(2.0 * std, min=-1.0, max=1.0)
        return float(valence.item()), float(arousal.item())

    def _norm(self, text: str) -> str:
        return " ".join((text or "").lower().split())

    def _memo_get(self, key: str) -> Optional[Dict[str, Any]]:
        if not key:
            return None
        val = self._memo.get(key)
        if val is not None:
            # promote
            self._memo.move_to_end(key)
        return val

    def _memo_put(self, key: str, value: Dict[str, Any]) -> None:
        if not key:
            return
        self._memo[key] = value
        self._memo.move_to_end(key)
        if len(self._memo) > self._memo_max:
            try:
                self._memo.popitem(last=False)
            except Exception:
                pass


__all__ = ["EmotionBrain", "EmotionConfig"]

# ---------------- Shadow evaluation (module-scope) -----------------

_SHADOW_ENABLED = (os.getenv("EMOTION_CALIB_SHADOW") or "").lower() in {"1","true","yes"}
try:
    _SHADOW_SAMPLING = float(os.getenv("EMOTION_CALIB_SHADOW_SAMPLING") or 0.05)
except Exception:
    _SHADOW_SAMPLING = 0.05
try:
    _SHADOW_COOLDOWN_MS = int(os.getenv("EMOTION_CALIB_SHADOW_COOLDOWN_MS") or 60000)
except Exception:
    _SHADOW_COOLDOWN_MS = 60000

# stats: {"n": int, "by": {idx: {"c":int, "md":float, "ar":float}}, "ts": int}
_shadow_stats: Dict[str, Any] = {"n": 0, "by": {}, "ts": int(_time.time())}
_shadow_last_log_ms: int = 0

def _shadow_maybe_update(
    probs_pre: torch.Tensor,
    probs_post: torch.Tensor,
    thresh: torch.Tensor,
    idx_sorted: List[int],
    top_k: int = 10,
) -> None:
    if not _SHADOW_ENABLED:
        return
    if _random.random() >= _SHADOW_SAMPLING:
        return
    try:
        top = idx_sorted[: max(1, min(10, int(top_k)) )]
        by = _shadow_stats.setdefault("by", {})
        for i in top:
            pre = float(probs_pre[i].item())
            post = float(probs_post[i].item())
            d = post - pre
            act = 1.0 if post >= float(thresh[i].item()) else 0.0
            st = by.get(i) or {"c": 0, "md": 0.0, "ar": 0.0}
            c = int(st.get("c", 0)) + 1
            md = float(st.get("md", 0.0)) + (d - float(st.get("md", 0.0))) / c
            ar = float(st.get("ar", 0.0)) + (act - float(st.get("ar", 0.0))) / c
            by[i] = {"c": c, "md": md, "ar": ar}
        _shadow_stats["n"] = int(_shadow_stats.get("n", 0)) + 1
        _shadow_stats["ts"] = int(_time.time())
        # rate-limited numeric-only log
        now_ms = int(_time.time() * 1000)
        global _shadow_last_log_ms
        if now_ms - _shadow_last_log_ms >= _SHADOW_COOLDOWN_MS:
            _shadow_last_log_ms = now_ms
            try:
                print("emotion.calib.shadow", {"n": int(_shadow_stats.get("n", 0)), "labels": int(len(_shadow_stats.get("by", {})))})
            except Exception:
                pass
    except Exception:
        pass

def get_shadow_snapshot() -> Dict[str, Any]:
    """
    Returns tiny numeric snapshot capped at 5 labels as integers only:
      { n, labels: [{i, c, md, ar}], ts }
      where md/ar are scaled by 1e6 and rounded to int.
    """
    by = _shadow_stats.get("by", {}) or {}
    # sort indices by count desc
    items = sorted([(int(i), v) for i, v in by.items()], key=lambda t: int(t[1].get("c", 0)), reverse=True)[:5]
    labels: List[Dict[str, int]] = []
    for i, v in items:
        c = int(v.get("c", 0))
        md = int(round(float(v.get("md", 0.0)) * 1_000_000))
        ar = int(round(float(v.get("ar", 0.0)) * 1_000_000))
        labels.append({"i": int(i), "c": c, "md": md, "ar": ar})
    return {"n": int(_shadow_stats.get("n", 0)), "labels": labels, "ts": int(_shadow_stats.get("ts", int(_time.time())))}

__all__.extend(["get_shadow_snapshot"])
