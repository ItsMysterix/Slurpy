#!/usr/bin/env python3
"""
NLP Runtime Probe

Collects quick facts about the current NLP stack:
- Package versions (python, torch, transformers, spacy)
- Pipeline models, devices, param counts, tokenizer limits
- Latency samples for analyze_text and emotion bucket
- Local emotion model labels and a sample prediction

Usage:
  python backend/scripts/nlp_probe.py
"""
from __future__ import annotations

import os
import sys
import time
import json
from typing import Any, Dict

print("=== NLP RUNTIME PROBE ===")

print("\n0) Environment…")
print("PYTHON:", sys.version.split(" (", 1)[0])

def _safe_import(name: str):
    try:
        mod = __import__(name)
        return mod
    except Exception as e:
        print(f" - {name}: not available ({e})")
        return None

torch = _safe_import("torch")
transformers = _safe_import("transformers")
spacy = _safe_import("spacy")

if transformers:
    print("transformers:", getattr(transformers, "__version__", "?"))
if torch:
    print("torch:", getattr(torch, "__version__", "?"))
    has_cuda = bool(getattr(torch, "cuda", None) and torch.cuda.is_available())
    print("cuda_available:", has_cuda)
if spacy:
    print("spacy:", getattr(spacy, "__version__", "?"))

print("HF_HOME:", os.getenv("HF_HOME") or "<unset>")
print("TRANSFORMERS_CACHE:", os.getenv("TRANSFORMERS_CACHE") or "<unset>")

# Ensure backend package is importable when running from repo root
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from slurpy.domain import nlp as _nlp_pkg  # type: ignore
from slurpy.domain.nlp import service as nlp  # type: ignore

print("\n1) Model metadata…")
def model_meta(pipe, name: str) -> Dict[str, Any]:
    meta: Dict[str, Any] = {"name": name}
    try:
        mdl = getattr(pipe, "model", None)
        tok = getattr(pipe, "tokenizer", None)
        if mdl is not None:
            # device and dtype
            dev = getattr(mdl, "device", None)
            meta["device"] = str(dev) if dev is not None else "<unknown>"
            dt = getattr(mdl, "dtype", None)
            meta["dtype"] = str(dt) if dt is not None else "<unknown>"
            # param count
            if torch is not None:
                try:
                    params = sum(p.numel() for p in mdl.parameters())
                    meta["params"] = params
                except Exception:
                    pass
            # model id
            cfg = getattr(mdl, "config", None)
            if cfg is not None:
                meta["model_id"] = getattr(cfg, "_name_or_path", None) or getattr(cfg, "name_or_path", None)
        if tok is not None:
            meta["max_length"] = getattr(tok, "model_max_length", None)
            meta["vocab_size"] = getattr(tok, "vocab_size", None)
    except Exception as e:
        meta["error"] = str(e)
    return meta

# Warm first to build singletons
try:
    nlp.warmup_nlp()
except Exception:
    pass

sent_pipe = nlp._sentiment_pipe()
emo_pipe = nlp._emotion_pipe()
tox_pipe = nlp._toxicity_pipe()

for meta in (model_meta(sent_pipe, "sentiment"), model_meta(emo_pipe, "emotion"), model_meta(tox_pipe, "toxicity")):
    print(" -", meta)

print("\n2) spaCy model…")
try:
    n = nlp._nlp()
    print(" - name:", getattr(getattr(n, "meta", {}), "get", lambda *_: None)("name") or "en_core_web_sm")
    # pipeline components
    print(" - pipeline:", list(n.pipe_names))
except Exception as e:
    print(" - error:", e)

print("\n3) Latency samples…")
def _mk_text(tokens: int) -> str:
    # approximate token count by repeating short words; HF tokenizers split similar
    base = "I feel a bit anxious about work deadlines and meetings. "
    return (base * ((tokens // 12) + 1))[:tokens*4]

def _timeit(fn, *args, repeats: int = 1, label: str = ""):
    t0 = time.perf_counter()
    out = None
    for _ in range(repeats):
        out = fn(*args)
    dt = (time.perf_counter() - t0) / repeats
    print(f" - {label}: {dt*1000:.1f} ms")
    return out, dt

try:
    # First call may pay extra one-time costs
    _, _ = _timeit(nlp.analyze_text, _mk_text(64), repeats=1, label="analyze_text ~64t (cold)")
    _, _ = _timeit(nlp.analyze_text, _mk_text(64), repeats=3, label="analyze_text ~64t (warm avg)")
    _, _ = _timeit(nlp.analyze_text, _mk_text(256), repeats=2, label="analyze_text ~256t (warm avg)")
    _, _ = _timeit(nlp.classify_emotion_bucket, _mk_text(64), repeats=5, label="emotion_bucket ~64t (warm avg)")
except Exception as e:
    print(" - timing error:", e)

print("\n4) Local emotion model (emotion/model)…")
try:
    from emotion.predict import ID2LABEL, predict_emotion, emotion_intensity  # type: ignore
    print(" - labels:", sorted({v for v in ID2LABEL.values()}))
    s = "I feel uneasy and keep overthinking before my exam."
    lab = predict_emotion(s)
    lab2, conf = emotion_intensity(s)
    print(" - sample predict:", {"text": s[:60] + ("…" if len(s) > 60 else ""), "label": lab})
    print(" - intensity:", {"label": lab2, "confidence": round(conf, 4)})
except Exception as e:
    print(" - local model not available:", e)

print("\n=== PROBE COMPLETE ===")
