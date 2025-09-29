# -*- coding: utf-8 -*-
"""
cel.py — Compact Emotion Layer (CEL) [prod-hardened]

Purpose
-------
Normalize classifier output (and user slang) into a small, actionable set and
return a "patch" the stack can use to tune style and UI nudges.

Public API
----------
make_patch(label: str, prob: float, persona: str, text: Optional[str]) -> Patch

- user_preface: short, empathetic preface to prepend to model’s reply
- system_addendum: style nudge string for downstream prompts
- tool_hint:  "Breathing" | "ConflictStyle" | "Stretch" | None
- max_questions: gently cap questions when dysregulated
- safety: "crisis" | None   (quick local signal; full routing still handled by safety.py)

Env
---
- CEL_USE_LLM=1           → enable GPT fallback router (requires OPENAI_API_KEY)
- CEL_DEBUG=true|1        → verbose prints from this module
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import re
from functools import lru_cache
from typing import Optional, Tuple, Dict, Any  # <-- added Dict, Any

# ─────────────────────────────────────────────────────────────────────────────
# Optional semantic router (GPT). Imported lazily & guarded.
try:
    from backend.cel_llm import llm_semantic_emotion  # type: ignore
except Exception:  # pragma: no cover
    llm_semantic_emotion = None  # type: ignore

# ─────────────────────────────────────────────────────────────────────────────
# Optional NLP enrichment (lazy, safe import)
try:
    from .nlp import analyze_text  # returns rich dict
except Exception:  # pragma: no cover
    analyze_text = None  # type: ignore

CEL_DEBUG = os.getenv("CEL_DEBUG", "false").lower() in {"1", "true", "yes"}
def _dbg(*a):  # tiny local logger
    if CEL_DEBUG:
        print("[CEL]", *a)

# ─────────────────────────────────────────────────────────────────────────────
# Patch contract returned to the caller
@dataclass
class Patch:
    system_addendum: str = ""
    user_preface: str = ""
    tool_hint: Optional[str] = None
    max_questions: int = 2
    safety: Optional[str] = None


# Short, human, safe empathetic lines
EMPATHY = {
    "anxious": "I’m hearing urgency and racing thoughts — let’s slow the tempo for a moment.",
    "angry":   "I can feel the heat here — your anger makes sense.",
    "sad":     "That sounds heavy. I’m here with you.",
    "neutral": "Got it.",
    "foggy":   "Things feel a bit foggy — we can go one step at a time.",
    "meaning": "Let’s look for the signal beneath the noise together.",
}

# Persona tweaks — you can pipe this into your system prompt if you want
STYLE = {
    "therapist": "Use evidence-based prompts (CBT/ACT). Validate emotions. Ask open questions. No diagnosis.",
    "coach":     "Be pragmatic and action-focused. Offer one concrete step.",
    "friend":    "Warm, casual, validating. Avoid advice dumping.",
}

# ─────────────────────────────────────────────────────────────────────────────
# Minimal crisis signals (fast, local). Full routing still handled by safety.py.
CRISIS_RX = re.compile(
    r"(kill myself|suicide|end my life|self[-\s]?harm|cutting|can['’]?t cope)",
    re.I,
)

# Helpers
def _root(w: str) -> str:
    """Very light stemming to fold simple variants together."""
    w = (w or "").lower().strip()
    w = w.replace("’", "'")
    for suf in ("ing", "ed", "ly", "ness", "s"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[: -len(suf)]
    return w

def _is_greeting(t: str) -> bool:
    t = (t or "").strip().lower()
    return t in {"hi", "hey", "hello", "yo", "sup", "hiya"} or (len(t) <= 3 and t in {"hi", "yo"})

# Canonical vocab buckets — add slang here to widen coverage
ANXIOUS_SET = {
    # direct
    "anxious", "anxiety", "worry", "worried", "nervous", "tense", "uneasy", "restless",
    # panic family
    "panic", "panick", "panicked", "panicking", "freak", "freakout",
    # edges & vibes
    "onedge", "edgy", "jitters", "jittery", "butterflies",
    # dread/fear
    "dread", "fear", "scared",
    # stress/overload
    "stressed", "overwhelm", "overwhelmed", "overthinking", "spiral", "spiraling",
}
ANGRY_SET = {
    "angry", "anger", "mad", "furious", "rage", "irritated", "irritate", "heated",
    "pissed", "annoyed", "frustrated", "hostile", "resentful",
}
SAD_SET = {
    "sad", "sadness", "depress", "depressed", "down", "blue", "numb", "exhausted",
    "tired", "lonely", "empty", "hopeless", "grief", "grieving", "loss",
}

# Regex signals from raw text (captures slang & physiology)
ANX_RX = re.compile(
    r"\b("
    r"panic(?:ked|king)?|"
    r"freak(?:ing)?\s*out|"
    r"overthink(?:ing)?|"
    r"spiral(?:ing)?|"
    r"nervous|worried|anxious|"
    r"on\s*edge|edgy|uneasy|jitters?|dread|scared|"
    r"short\s*of\s*breath|can(?:'|no)t\s*breathe|"
    r"heart\s*(?:racing|beating|pounding)"
    r")\b",
    re.I,
)
ANG_RX = re.compile(
    r"\b("
    r"furious|pissed|angry|rage|"
    r"irritat(?:e|ed|ing)|heated|annoyed|"
    r"snapped?|blow\s*up|yell(?:ed|ing)?"
    r")\b",
    re.I,
)
SAD_RX = re.compile(
    r"\b("
    r"sad|down|blue|depress(?:ed|ion)?|"
    r"numb|exhausted|tired|lonely|empty|hopeless|grief|loss"
    r")\b",
    re.I,
)

def _normalize_label(label: str) -> str:
    """Map classifier label to a canonical bucket."""
    l = _root(label or "neutral")
    if l in ANXIOUS_SET:
        return "anxious"
    if l in ANGRY_SET:
        return "angry"
    if l in SAD_SET:
        return "sad"
    if l in {"foggy"}:
        return "foggy"
    if l in {"meaning", "meaningful"}:
        return "meaning"
    return "neutral"

def _text_hint(text: Optional[str]) -> Optional[str]:
    """Regex nudge from raw text; returns a canonical label or None."""
    if not text or not text.strip():
        return None
    t = text
    if ANX_RX.search(t):
        return "anxious"
    if ANG_RX.search(t):
        return "angry"
    if SAD_RX.search(t):
        return "sad"
    return None

# ─────────────────────────────────────────────────────────────────────────────
# LLM fallback (optional) with memoization to cut cost/latency
@lru_cache(maxsize=1024)
def _llm_route_cached(sample: str) -> Optional[Tuple[str, float]]:
    """Cache results for identical prompts; returns (label, conf) or None."""
    if not (os.getenv("CEL_USE_LLM", "0").lower() in {"1", "true", "yes"} and llm_semantic_emotion):
        return None
    try:
        data = llm_semantic_emotion(sample or "")
        if isinstance(data, dict) and data.get("label"):
            lab = str(data["label"]).strip().lower()
            conf = float(data.get("confidence") or 0.75)
            return _normalize_label(lab), max(0.0, min(1.0, conf))
    except Exception:
        pass
    return None

def _resolve_emotion(label: str, prob: float, text: Optional[str]) -> Tuple[str, float]:
    """
    Decide on a canonical emotion using:
      1) classifier label (if confident enough)
      2) text hints (regex) if low confidence
      3) optional LLM fallback if still low and enabled
    """
    canon = _normalize_label(label)
    if prob >= 0.72:
        _dbg("classifier confident →", canon, prob)
        return canon, prob

    hint = _text_hint(text)
    if hint:
        _dbg("regex hint →", hint)
        # bump a bit so downstream can trigger tools confidently
        return hint, max(prob, 0.78)

    # Only route to LLM if we have enough text to meaningfully parse
    t = (text or "").strip()
    if len(t) >= 6 and not _is_greeting(t):
        cached = _llm_route_cached(t.lower())
        if cached:
            _dbg("llm route →", cached)
            return cached

    _dbg("fallback neutral-ish →", canon, prob)
    return canon, prob

# ─────────────────────────────────────────────────────────────────────────────
# Public API
def make_patch(label: str, prob: float, persona: str, text: Optional[str] = None) -> Patch:
    """
    Build the CEL patch. `text` is optional; if omitted, we rely on the classifier label.
    """
    emo, conf = _resolve_emotion(label, prob, text)

    p = Patch()
    p.user_preface = EMPATHY.get(emo, EMPATHY["neutral"])
    p.system_addendum = STYLE.get(persona, STYLE.get("therapist", ""))

    # Tiny, targeted interventions (frontend chooses how to render)
    if emo == "anxious":
        p.tool_hint = "Breathing"
        p.max_questions = 1
    elif emo == "angry":
        p.tool_hint = "ConflictStyle"
        p.max_questions = 1
    elif emo == "sad":
        p.tool_hint = "Stretch"
        p.max_questions = 1

    # Quick client-side safety lane (still rely on backend safety.py for canonical routing)
    if text and CRISIS_RX.search(text):
        p.safety = "crisis"

    return p

# ─────────────────────────────────────────────────────────────────────────────
# Optional: compact NLP context for storage/search (tiny & stable)
def build_context(text: str) -> Dict[str, Any]:
    """
    Returns a compact JSON-able dict:
      {
        "sent": {"label": str, "pos": float, "neu": float, "neg": float},
        "emo": str,
        "tox": float,
        "ents": [str, ...],   # top 5 unique
        "key":  [str, ...],   # top 5 keyphrases
      }
    Falls back to {} if analyze_text is unavailable.
    """
    if not analyze_text or not text or not text.strip():
        return {}
    try:
        nlp = analyze_text(text)
        return {
            "sent": {
                "label": nlp["sentiment"]["label"],
                "pos": round(float(nlp["sentiment"]["pos"]), 4),
                "neu": round(float(nlp["sentiment"]["neu"]), 4),
                "neg": round(float(nlp["sentiment"]["neg"]), 4),
            },
            "emo": nlp["emotion"]["top"],
            "tox": round(float(nlp["toxicity"]["score"]), 4),
            "ents": sorted({e["text"] for e in nlp.get("entities", [])})[:5],
            "key": nlp.get("keyphrases", [])[:5],
        }
    except Exception:
        return {}

def maybe_build_context(text: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Guarded variant: returns None on failure/empty text.
    """
    if not text or not text.strip():
        return None
    ctx = build_context(text)
    return ctx or None

__all__ = ["Patch", "make_patch", "build_context", "maybe_build_context"]
