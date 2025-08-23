# -*- coding: utf-8 -*-
"""
cel.py — Compact Emotion Layer (CEL)

Purpose
-------
Normalize whatever the classifier (or user slang) throws at us into a small,
actionable set of emotions and return a "patch" the frontend/backend can use
to tune response style and trigger inline interventions (e.g., Breathing).

Key features
------------
• Robust normalization: panic/panicked/panicking, nervous, worried, stressed,
  overwhelmed, spiraling, on edge, *edgy*, etc. → "anxious"
• Lightweight text heuristics (regex) catch slang & physiology (heart racing, can't breathe)
• Optional GPT fallback router for low-confidence cases
  - Enable with env: CEL_USE_LLM=1 and OPENAI_API_KEY set
  - Strict JSON, low temp, redacted input; returns one of:
    {"anxious","angry","sad","foggy","meaning","neutral"}

Return shape
------------
make_patch(label: str, prob: float, persona: str, text: Optional[str]) -> Patch

- user_preface: short empathetic preface to prepend to model’s reply
- system_addendum: style nudge for downstream generation (if you choose to use it)
- tool_hint:  "Breathing" | "ConflictStyle" | "Stretch" | None
- max_questions: gentle cap to keep responses tight during dysregulation
- safety: "crisis" | None  (placeholder; extend if you add explicit crisis labels)

This file is self-contained and safe if GPT is unavailable (falls back gracefully).
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import re
from typing import Optional

# ─────────────────────────────────────────────────────────────────────────────
# Optional semantic router (GPT) — only used if CEL_USE_LLM=1 and OPENAI_API_KEY is set
try:
    from cel_llm import llm_semantic_emotion  # type: ignore
except Exception:  # pragma: no cover
    llm_semantic_emotion = None  # type: ignore


# ─────────────────────────────────────────────────────────────────────────────
# Patch contract returned to the caller
@dataclass
class Patch:
    system_addendum: str = ""
    user_preface: str = ""
    tool_hint: Optional[str] = None
    max_questions: int = 2
    safety: Optional[str] = None


# Short, human, and safe empathetic lines
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
# Helpers
def _root(w: str) -> str:
    """Very light stemming to fold simple variants together."""
    w = (w or "").lower().strip()
    for suf in ("ing", "ed", "ly", "ness", "s"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[: -len(suf)]
    return w


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
    # keep extra lanes for future semantics if you want
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


def _resolve_emotion(label: str, prob: float, text: Optional[str]) -> tuple[str, float]:
    """
    Decide on a canonical emotion using:
      1) classifier label (if confident >= 0.72)
      2) text hints (regex) if low confidence
      3) optional GPT fallback if still low and enabled
    """
    canon = _normalize_label(label)
    if prob >= 0.72:
        return canon, prob

    hint = _text_hint(text)
    if hint:
        # bump a bit so downstream logic can confidently trigger tools
        return hint, max(prob, 0.78)

    use_llm = os.getenv("CEL_USE_LLM", "0").lower() in {"1", "true", "yes"}
    if use_llm and llm_semantic_emotion:
        try:
            data = llm_semantic_emotion(text or "")
            if isinstance(data, dict) and data.get("label"):
                lab = str(data.get("label"))
                conf = float(data.get("confidence") or 0.75)
                return _normalize_label(lab), conf
        except Exception:
            # silent fallback
            pass

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
    p.system_addendum = STYLE.get(persona, STYLE["therapist"])

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

    # Safety lane (placeholder). Extend when your classifier exposes crisis labels.
    if conf >= 0.8 and emo in {"self-harm", "suicidal", "violence"}:
        p.safety = "crisis"

    return p


__all__ = ["Patch", "make_patch"]
