# backend/slurpy/domain/nlp/service.py
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple, Mapping, Sequence, cast
from functools import lru_cache

import spacy
from spacy.language import Language
from spacy.tokens import Doc

from transformers.pipelines import pipeline
import os
import json
from math import isnan

# Optional slang/emoji normalization deps (fallback gracefully if missing)
try:
    import emoji  # type: ignore
except Exception:
    emoji = None  # type: ignore
try:
    from ekphrasis.classes.preprocessor import TextPreProcessor  # type: ignore
    from ekphrasis.classes.tokenizer import SocialTokenizer  # type: ignore
except Exception:
    TextPreProcessor = None  # type: ignore
    SocialTokenizer = None  # type: ignore

# New emotion engine
try:
    from .emotion2 import EmotionBrain, get_shadow_snapshot as _eb_shadow_snapshot
except Exception:
    EmotionBrain = None  # type: ignore
    _eb_shadow_snapshot = None  # type: ignore

# ---------- Lazy singletons (thread-safe enough for uvicorn workers) ----------

@lru_cache(maxsize=1)
def _nlp() -> Language:
    # en_core_web_sm should be preinstalled in the image
    return spacy.load("en_core_web_sm")

@lru_cache(maxsize=1)
def _sentiment_pipe():
    # 3-class sentiment: POSITIVE / NEUTRAL / NEGATIVE
    return pipeline(
        "text-classification",
        model="cardiffnlp/twitter-roberta-base-sentiment-latest",
        top_k=None,  # return all scores (new API; replaces return_all_scores=True)
    )

@lru_cache(maxsize=1)
def _emotion_pipe():
    # Public GoEmotions model
    return pipeline(
        "text-classification",
        model="SamLowe/roberta-base-go_emotions",
        top_k=None,  # return all scores
    )

@lru_cache(maxsize=1)
def _toxicity_pipe():
    return pipeline(
        "text-classification",
        model="unitary/unbiased-toxic-roberta",
        top_k=None,  # return all scores
    )

# ---------- Helpers ----------

_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE_RE = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b")
_URL_RE   = re.compile(r"\bhttps?://\S+\b", re.I)

PII_ENTITY_LABELS = {"PERSON", "GPE", "LOC", "ORG"}
SAFE_REPLACER = "▇▇"

def _clip(x: float) -> float:
    try:
        f = float(x)
    except Exception:
        f = 0.0
    return 0.0 if f < 0 else 1.0 if f > 1 else f

def _topk(
    scores: Sequence[Mapping[str, Any]] | Sequence[Sequence[Mapping[str, Any]]],
    k: int = 5,
) -> List[Tuple[str, float]]:
    """
    Normalizes outputs from transformers pipelines when top_k=None.
    Input shape is typically: [[{"label": "...", "score": 0.x}, ...]]
    """
    if not scores:
        return []
    first = scores[0]
    if isinstance(first, (list, tuple)):
        seq = cast(Sequence[Mapping[str, Any]], first)
        items = [(str(d["label"]), float(d["score"])) for d in seq if isinstance(d, Mapping) and "label" in d and "score" in d]
    elif isinstance(first, Mapping):
        seq = cast(Sequence[Mapping[str, Any]], scores)
        items = [(str(d["label"]), float(d["score"])) for d in seq if "label" in d and "score" in d]
    else:
        return []
    items.sort(key=lambda t: t[1], reverse=True)
    return items[:k]

# ---- Calibration via environment -------------------------------------------

def _parse_emotion_calib_env() -> Tuple[Dict[str, float], Dict[str, float]]:
    """Parse EMOTION_CALIB_JSON env var.
    Returns (temperature_map, threshold_map) with lowercase keys.
    Example JSON:
      {"temperature": {"joy": 0.9}, "threshold": {"joy": 0.45}}
    """
    raw = os.getenv("EMOTION_CALIB_JSON") or ""
    if not raw.strip():
        return {}, {}
    try:
        data = json.loads(raw)
        tmap: Dict[str, float] = {}
        hmap: Dict[str, float] = {}
        if isinstance(data, dict):
            tem = data.get("temperature")
            if isinstance(tem, dict):
                for k, v in tem.items():
                    try:
                        tmap[str(k).lower()] = float(v)
                    except Exception:
                        pass
            thr = data.get("threshold") or data.get("thresholds")
            if isinstance(thr, dict):
                for k, v in thr.items():
                    try:
                        hmap[str(k).lower()] = float(v)
                    except Exception:
                        pass
        return tmap, hmap
    except Exception:
        return {}, {}

def _apply_emotion_calibration_to_scores(
    scores: Sequence[Mapping[str, Any]] | Sequence[Sequence[Mapping[str, Any]]]
) -> List[List[Dict[str, Any]]]:
    """Apply temperature scaling to raw pipeline output and renormalize per sequence.
    Returns a normalized nested list [[{label,score}...]] matching pipeline structure.
    If no calibration is present, returns a structurally equal copy.
    """
    tmap, _ = _parse_emotion_calib_env()
    # normalize to nested list of dicts
    if not scores:
        return [[]]
    first = scores[0]
    seqs: List[List[Dict[str, Any]]]
    if isinstance(first, (list, tuple)):
        seqs = [[{"label": str(d["label"]), "score": float(d["score"])} for d in cast(Sequence[Mapping[str, Any]], s)] for s in cast(Sequence[Sequence[Mapping[str, Any]]], scores)]
    elif isinstance(first, Mapping):
        s = cast(Sequence[Mapping[str, Any]], scores)
        seqs = [[{"label": str(d["label"]), "score": float(d["score"])} for d in s]]
    else:
        return [[]]

    if not tmap:
        return seqs

    out: List[List[Dict[str, Any]]] = []
    for seq in seqs:
        # apply per-label temperature: s' = s ** temp
        adj: List[float] = []
        labels: List[str] = []
        for item in seq:
            lab = str(item.get("label", "")).lower()
            s = float(item.get("score", 0.0))
            temp = max(1e-6, float(tmap.get(lab, 1.0)))
            val = s ** temp
            adj.append(val)
            labels.append(item.get("label", ""))
        total = sum(adj) or 1.0
        norm = [max(0.0, min(1.0, v / total)) for v in adj]
        out.append([{ "label": labels[i], "score": norm[i]} for i in range(len(labels))])
    return out

def _select_top_with_threshold(items: List[Tuple[str, float]], thresholds: Dict[str, float]) -> str:
    """Given a sorted list of (label,score) and per-label thresholds, return label or 'neutral'."""
    if not items:
        return "neutral"
    lab, sc = items[0]
    thr = float(thresholds.get((lab or "").lower(), -1.0))
    if thr >= 0.0 and sc < thr:
        return "neutral"
    return lab or "neutral"

def _keyphrases(doc: Doc, limit: int = 8) -> List[str]:
    phrases = set()
    for nc in doc.noun_chunks:
        s = nc.text.strip()
        if 3 <= len(s) <= 60:
            phrases.add(s.lower())
    for ent in doc.ents:
        if ent.label_ in {"ORG", "PRODUCT", "WORK_OF_ART", "EVENT", "PERSON", "GPE"}:
            phrases.add(ent.text.strip())
    return sorted(phrases, key=lambda s: (-len(s), s))[:limit]

def redact(text: str) -> str:
    t = _EMAIL_RE.sub(SAFE_REPLACER, text)
    t = _PHONE_RE.sub(SAFE_REPLACER, t)
    t = _URL_RE.sub(SAFE_REPLACER, t)

    doc = _nlp()(t)
    out: List[str] = []
    for tok in doc:
        out.append(SAFE_REPLACER if tok.ent_type_ in PII_ENTITY_LABELS else tok.text)
        out.append(tok.whitespace_)
    return "".join(out)

# ---------- Slang + emoji normalization (for transformer pipelines only) ----------

_SLANG_MAP: Dict[str, str] = {
    # Common internet slang → simpler equivalents
    "lmao": "lol",
    "lmaoo": "lol",
    "lmaooo": "lol",
    "rofl": "lol",
    "omg": "oh my god",
    "idk": "i don't know",
    "imo": "in my opinion",
    "imho": "in my humble opinion",
    "lmk": "let me know",
    "tbh": "to be honest",
    "afaik": "as far as i know",
    "smh": "shaking my head",
    "ikr": "i know right",
    "btw": "by the way",
}

@lru_cache(maxsize=2048)
def slang_normalize(text: str) -> str:
    """
    Light-weight normalization for social text:
    - demojize (emoji → english tokens)
    - lowercase
    - reduce extreme elongations (cooool -> coool)
    - expand a few high-signal slang tokens
    - optionally use ekphrasis SocialTokenizer for robust tokenization
    Note: we do NOT feed this into spaCy PII redaction to avoid drift; it's
    only used for transformer-based sentiment/emotion/toxicity models.
    """
    if not text:
        return ""
    t = text
    # Replace emoji with text (e.g., :loudly_crying_face:)
    if emoji is not None:
        try:
            t = emoji.demojize(t)
            # strip colons and underscores for model-friendlier tokens
            t = t.replace(":", " ").replace("_", " ")
        except Exception:
            pass
    t = t.lower()
    # Reduce elongated characters (keep up to 2 repeats)
    try:
        import re as _re
        t = _re.sub(r"(.)\1{2,}", r"\1\1", t)
    except Exception:
        pass

    # Tokenize (ekphrasis) if available, otherwise simple split
    toks: List[str]
    if TextPreProcessor is not None and SocialTokenizer is not None:
        try:
            pre = _slang_preproc()
            toks = pre.pre_process_doc(t)
        except Exception:
            toks = t.split()
    else:
        toks = t.split()

    # Apply simple slang map
    out: List[str] = []
    for tok in toks:
        out.append(_SLANG_MAP.get(tok, tok))
    return " ".join(out).strip()

@lru_cache(maxsize=1)
def _slang_preproc():
    if TextPreProcessor is None or SocialTokenizer is None:
        raise RuntimeError("ekphrasis not available")
    return TextPreProcessor(
        normalize=["url", "email", "user", "hashtag", "emoticon", "emoji", "percent", "money", "time", "date", "number"],
        annotate={"repeated"},
        fix_html=True,
        segmenter="twitter",
        unpack_contractions=True,
        unpack_hashtags=True,
        tokenizer=SocialTokenizer(lowercase=False).tokenize,
        dicts={}
    )

# ---------- Public core API ----------

def analyze_text(text: str) -> Dict[str, Any]:
    """
    Returns:
      {
        "tokens":    [{"text","lemma","pos","ent"}...],
        "entities":  [{"text","label","start","end"}...],
        "keyphrases":[str],
        "sentiment": {"label","score","pos","neu","neg"},
        "emotion":   {"top": str, "scores": [{"label","score"}...]},
        "toxicity":  {"score": float, "labels":[{"label","score"}...]}
      }
    """
    # spaCy on original text (better PII/NER fidelity)
    doc = _nlp()(text)
    tokens = [{"text": t.text, "lemma": t.lemma_, "pos": t.pos_, "ent": t.ent_type_ or None} for t in doc]
    entities = [{"text": e.text, "label": e.label_, "start": e.start_char, "end": e.end_char} for e in doc.ents]
    keyphr = _keyphrases(doc)

    # Sentiment (normalized social text)
    ntext = slang_normalize(text)
    s_scores = _sentiment_pipe()(ntext)
    s_top = _topk(s_scores, k=3)
    tri = {lbl.lower()[:3]: sc for lbl, sc in s_top}
    sentiment = {
        "label": s_top[0][0] if s_top else "NEUTRAL",
        "score": _clip(s_top[0][1]) if s_top else 0.5,
        "pos": _clip(tri.get("pos", 0.0)),
        "neu": _clip(tri.get("neu", 0.0)),
        "neg": _clip(tri.get("neg", 0.0)),
    }

    # Emotion (GoEmotions) on normalized text
    e_scores_raw = _emotion_pipe()(ntext)
    e_scores_cal = _apply_emotion_calibration_to_scores(e_scores_raw)
    e_top = _topk(e_scores_cal, k=5)
    _, _thrmap = _parse_emotion_calib_env()
    top_label = _select_top_with_threshold(e_top, _thrmap)
    emotion = {
        "top": top_label if e_top else "neutral",
        "scores": [{"label": l, "score": _clip(s)} for l, s in e_top],
    }

    # Toxicity on normalized text
    t_scores = _toxicity_pipe()(ntext)
    t_top = _topk(t_scores, k=5)
    tox = 0.0
    for l, s in t_top:
        if "toxic" in l.lower():
            tox = max(tox, s)
    toxicity = {"score": _clip(tox), "labels": [{"label": l, "score": _clip(s)} for l, s in t_top]}

    result: Dict[str, Any] = {
        "tokens": tokens,
        "entities": entities,
        "keyphrases": keyphr,
        "sentiment": sentiment,
        "emotion": emotion,
        "toxicity": toxicity,
    }

    # Augment with v2 bundle when enabled and available (does not remove legacy keys)
    if (os.getenv("EMOTION_V2") or "").lower() in {"1","true","yes"}:
        try:
            eb = get_emotion_brain()
        except Exception:
            eb = None
        if eb is not None:
            try:
                v2 = eb.predict(ntext)
                result["normalizedText"] = ntext
                result["emotions"] = {
                    "labels": v2.get("labels", []),
                    "probs": v2.get("probs", {}),
                }
                result["valence"] = float(v2.get("valence", 0.0))
                result["arousal"] = float(v2.get("arousal", 0.0))
            except Exception:
                pass

    return result

def analyze_and_redact(text: str) -> Dict[str, Any]:
    data = analyze_text(text)
    data["redacted"] = redact(text)
    return data

def warmup_nlp() -> None:
    # Call on startup to avoid first-request latency
    _ = _nlp()
    _ = _sentiment_pipe()
    _ = _emotion_pipe()
    _ = _toxicity_pipe()
    # Only warm EmotionBrain when explicitly enabled
    if (os.getenv("EMOTION_V2") or "").lower() in {"1","true","yes"}:
        try:
            eb = get_emotion_brain()
            if eb is not None:
                eb.warmup()
        except Exception:
            # EmotionBrain is optional; warmup best-effort
            pass
    # Run a one-time canary for calibration
    try:
        st = __calib_canary__()
        # Numeric-only print for ops visibility
        print("emotion.calib.canary", {"ok": 1 if st.get("ok") else 0, "hash": int(st.get("hash", 0))})
        # Drift detection (rate-limited)
        eps = int(os.getenv("EMOTION_CALIB_DRIFT_EPS") or 2500)
        cd = int(os.getenv("EMOTION_CALIB_DRIFT_COOLDOWN_MS") or 60000)
        __calib_drift_warn_if_needed__(int(st.get("hash", 0)), eps, cd)
    except Exception:
        pass

# Expose tiny shadow snapshot for health peek (integers only)
def __calib_shadow_snapshot__() -> Dict[str, Any]:
    try:
        if _eb_shadow_snapshot is not None:
            snap = _eb_shadow_snapshot()
            # ensure ints only in md/ar
            out = {
                "n": int(snap.get("n", 0)),
                "labels": [
                    {
                        "i": int(d.get("i", 0)),
                        "c": int(d.get("c", 0)),
                        "md": int(d.get("md", 0)),
                        "ar": int(d.get("ar", 0)),
                    } for d in (snap.get("labels", []) or [])
                ],
                "ts": int(snap.get("ts", 0)),
            }
            return out
    except Exception:
        pass
    return {"n": 0, "labels": [], "ts": 0}

# --- Stable façade helpers (prod-ready) --------------------------------------

# Canonical buckets
_BUCKETS = {
    "anxious": {
        "anxiety", "nervousness", "fear", "worry", "panic", "apprehension", "nervous",
        "afraid", "scared", "worries",
    },
    "angry": {
        "anger", "annoyance", "disgust", "resentment", "rage", "frustration",
        "hostility", "contempt", "irritation", "annoyed", "furious",
    },
    "sad": {
        "sadness", "grief", "disappointment", "loneliness", "despair", "remorse",
        "hurt", "pessimism", "depression", "depressed", "down",
    },
}

def _map_goemotion_to_bucket(raw_label: str) -> str:
    l = (raw_label or "").strip().lower()
    for bucket, vocab in _BUCKETS.items():
        if l in vocab:
            return bucket
    return "neutral"

def _smooth_conf(x: float) -> float:
    # avoid spiky 0.99; keep a minimum signal so downstream UX behaves
    try:
        f = float(x)
    except Exception:
        f = 0.0
    f = max(0.0, min(1.0, f))
    return round(0.15 + 0.8 * f, 4)

def _lexical_guess(text: str) -> str | None:
    t = (text or "").lower()
    if any(w in t for w in ("panic", "panicked", "panicking", "anxious", "nervous", "worried", "overwhelmed", "fear", "dread", "on edge", "edgy")):
        return "anxious"
    if any(w in t for w in ("angry", "mad", "furious", "irritated", "frustrated", "resentful")):
        return "angry"
    if any(w in t for w in ("sad", "down", "depressed", "empty", "tired", "numb", "lonely")):
        return "sad"
    return None

@lru_cache(maxsize=1024)
def _analyze_cached(text: str) -> dict:
    # normalize whitespace for cache key consistency
    t = " ".join((text or "").split())
    return analyze_text(t)

def classify_emotion_bucket(text: str) -> tuple[str, float, str]:
    """
    Returns: (bucket, confidence, raw_top_label)
      - bucket ∈ {"anxious","angry","sad","neutral"}
      - confidence ∈ [0,1] (smoothed)
      - raw_top_label: top GoEmotions label (lowercased) if available, else "neutral"
    Gracefully falls back to lexical guess, then neutral.
    """
    try:
        data = _analyze_cached(text)
        emo = data.get("emotion", {}) if isinstance(data, dict) else {}
        scores = emo.get("scores") or []
        if scores:
            raw_top = str(scores[0]["label"]).strip().lower()
            conf = float(scores[0]["score"])
        else:
            raw_top, conf = "neutral", 0.0

        bucket = _map_goemotion_to_bucket(raw_top)
        if bucket == "neutral":
            lex = _lexical_guess(text)
            if lex:
                bucket, raw_top, conf = lex, raw_top, max(conf, 0.55)

        return bucket, _smooth_conf(conf), raw_top or "neutral"
    except Exception:
        lex = _lexical_guess(text)
        return (lex or "neutral", 0.5 if lex else 0.0, "neutral")

def classify_sentiment_triple(text: str) -> dict:
    """
    Returns: {"label": str, "pos": float, "neu": float, "neg": float}
    Uses the same pipeline output as analyze_text(); values are clipped [0,1].
    """
    try:
        s = _analyze_cached(text).get("sentiment", {}) or {}
        return {
            "label": s.get("label", "NEUTRAL"),
            "pos": float(s.get("pos", 0.0)),
            "neu": float(s.get("neu", 0.0)),
            "neg": float(s.get("neg", 0.0)),
        }
    except Exception:
        return {"label": "NEUTRAL", "pos": 0.0, "neu": 1.0, "neg": 0.0}

def toxicity_score(text: str) -> float:
    """
    Returns a single toxicity score ∈ [0,1] for quick gating/UX nudges.
    """
    try:
        tox = _analyze_cached(text).get("toxicity", {}) or {}
        return float(tox.get("score", 0.0))
    except Exception:
        return 0.0

# Async variants with timeouts (optional use)
async def classify_emotion_bucket_async(text: str, timeout_ms: int = 1200) -> tuple[str, float, str]:
    import asyncio
    try:
        return await asyncio.wait_for(asyncio.to_thread(classify_emotion_bucket, text), timeout=timeout_ms/1000.0)
    except Exception:
        lex = _lexical_guess(text)
        return (lex or "neutral", 0.5 if lex else 0.0, "neutral")

__all__ = [
    "analyze_text",
    "analyze_and_redact",
    "warmup_nlp",
    "redact",
    "classify_emotion_bucket",
    "classify_emotion_bucket_async",
    "classify_sentiment_triple",
    "toxicity_score",
]

# --- Singleton accessor for EmotionBrain (optional, prod-ready) -----------
from functools import lru_cache as _lru_cache

@_lru_cache(maxsize=1)
def get_emotion_brain():
    """
    Returns a singleton EmotionBrain instance based on env EMOTION_MODEL_ID.
    If emotion2 module/import is unavailable, returns None to keep legacy paths working.
    """
    if EmotionBrain is None:
        return None
    model_id = os.getenv("EMOTION_MODEL_ID") or "SamLowe/roberta-base-go_emotions"
    try:
        return EmotionBrain(model_id=model_id)
    except Exception:
        return None

__all__.append("get_emotion_brain")

# --- v2 analysis entry points ----------------------------------------------
async def analyze_text_v2(text: str, max_len: int = 512, top_k: int = 5) -> Dict[str, Any]:
    """
    Emotion v2 analysis:
      - When EMOTION_V2=true and EmotionBrain is available, use the async micro-batched path.
      - Otherwise, fall back to classic analyze_text() output.
    Returns the EmotionBrain result dict or the legacy analyze_text() structure.
    """
    if (os.getenv("EMOTION_V2") or "").lower() in {"1","true","yes"}:
        eb = get_emotion_brain()
        if eb is not None:
            try:
                return await eb.predict_async(slang_normalize(text), max_len=max_len, top_k=top_k)
            except Exception:
                pass
    # Fallback to legacy analysis
    return analyze_text(text)

def analyze_text_v2_blocking(text: str, max_len: int = 512, top_k: int = 5) -> Dict[str, Any]:
    if (os.getenv("EMOTION_V2") or "").lower() in {"1","true","yes"}:
        eb = get_emotion_brain()
        if eb is not None:
            try:
                return eb.predict(slang_normalize(text), max_len=max_len, top_k=top_k)
            except Exception:
                pass
    return analyze_text(text)

__all__.extend(["analyze_text_v2", "analyze_text_v2_blocking"])

# ---- Calibration canary (private) -------------------------------------------
# Baseline: weights {joy:3, sadness:2, anger:1} dot [0.6,0.3,0.1] = 2.5 → 2_500_000
_CALIB_CANARY_BASELINE = 2_500_000
# Persist last canary result
__calib_canary_last: Dict[str, Any] = {"ok": True, "hash": _CALIB_CANARY_BASELINE}
_calib_last_warn_ms: int = 0

def __calib_drift_warn_if_needed__(hash_now: int, eps: int, cooldown_ms: int) -> None:
    """Emit a numeric-only drift warning if deviation from baseline exceeds eps and cooldown elapsed."""
    try:
        from time import time
        delta = abs(int(hash_now) - int(_CALIB_CANARY_BASELINE))
        if delta <= int(eps):
            return
        now_ms = int(time() * 1000)
        global _calib_last_warn_ms
        if now_ms - _calib_last_warn_ms < int(cooldown_ms):
            return
        _calib_last_warn_ms = now_ms
        # Numeric-only log line
        print("emotion.calib.drift", {"d": int(delta), "h": int(hash_now)})
    except Exception:
        pass

def __calib_canary__() -> Dict[str, Any]:
    try:
        # fixed synthetic dist
        base = [[
            {"label": "joy", "score": 0.6},
            {"label": "sadness", "score": 0.3},
            {"label": "anger", "score": 0.1},
        ]]
        cal = _apply_emotion_calibration_to_scores(base)
        seq = cal[0]
        # validity checks
        tot = sum(float(it["score"]) for it in seq)
        if isnan(tot) or not (0.9 <= tot <= 1.1):
            __calib_canary_last.update({"ok": False, "hash": 0})
            return __calib_canary_last
        # threshold gate
        _, thr = _parse_emotion_calib_env()
        e_top = sorted([(d["label"], float(d["score"])) for d in seq], key=lambda t: t[1], reverse=True)
        top = _select_top_with_threshold(e_top, thr)
        if not (isinstance(top, str) and top):
            __calib_canary_last.update({"ok": False, "hash": 0})
            return __calib_canary_last
        # hash: weighted sum * 1e6 rounded
        weights = {"joy": 3, "sadness": 2, "anger": 1}
        wsum = 0.0
        for d in seq:
            lab = str(d["label"]).lower()
            wsum += float(d["score"]) * float(weights.get(lab, 0))
        h = int(round(wsum * 1_000_000))
        # baseline expectation when no env
        loaded = bool(os.getenv("EMOTION_CALIB_JSON"))
        ok = True if (loaded or h == _CALIB_CANARY_BASELINE) else False
        __calib_canary_last.update({"ok": ok, "hash": h})
        return __calib_canary_last
    except Exception:
        __calib_canary_last.update({"ok": False, "hash": 0})
        return __calib_canary_last
