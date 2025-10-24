# -*- coding: utf-8 -*-
"""
service.py — Compact Emotion Layer (CEL) [prod-hardened]

Public API
----------
make_patch(label: str, prob: float, persona: str, text: Optional[str]) -> Patch

- user_preface: short, empathetic preface to prepend to model’s reply
- system_addendum: style nudge string for downstream prompts
- tool_hint:  "Breathing" | "ConflictStyle" | "Stretch" | None
- max_questions: gently cap questions when dysregulated
- safety: "crisis" | None
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import re
from functools import lru_cache
from typing import Optional, Tuple, Dict, Any, List

# Optional semantic router (GPT). Imported lazily & guarded.
try:
    from .llm_router import llm_semantic_emotion  # type: ignore
except Exception:  # pragma: no cover
    llm_semantic_emotion = None  # type: ignore

# Optional NLP enrichment (lazy, safe import)
try:
    from slurpy.domain.nlp.service import analyze_text  # returns rich dict
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

# Minimal crisis signals (fast, local). Full routing still handled by safety.py.
CRISIS_RX = re.compile(
    r"(kill myself|suicide|end my life|self[-\s]?harm|cutting|can['’]?t cope)",
    re.I,
)

# Helpers
def _root(w: str) -> str:
    w = (w or "").lower().strip().replace("’", "'")
    for suf in ("ing", "ed", "ly", "ness", "s"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[: -len(suf)]
    return w

def _is_greeting(t: str) -> bool:
    t = (t or "").strip().lower()
    return t in {"hi", "hey", "hello", "yo", "sup", "hiya"} or (len(t) <= 3 and t in {"hi", "yo"})

ANXIOUS_SET = {
    "anxious", "anxiety", "worry", "worried", "nervous", "tense", "uneasy", "restless",
    "panic", "panick", "panicked", "panicking", "freak", "freakout",
    "onedge", "edgy", "jitters", "jittery", "butterflies",
    "dread", "fear", "scared",
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
    l = _root(label or "neutral")
    if l in ANXIOUS_SET: return "anxious"
    if l in ANGRY_SET:   return "angry"
    if l in SAD_SET:     return "sad"
    if l in {"foggy"}:   return "foggy"
    if l in {"meaning", "meaningful"}: return "meaning"
    return "neutral"

def _text_hint(text: Optional[str]) -> Optional[str]:
    if not text or not text.strip(): return None
    if ANX_RX.search(text): return "anxious"
    if ANG_RX.search(text): return "angry"
    if SAD_RX.search(text): return "sad"
    return None

@lru_cache(maxsize=1024)
def _llm_route_cached(sample: str) -> Optional[Tuple[str, float]]:
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
    canon = _normalize_label(label)
    if prob >= 0.72:
        _dbg("classifier confident →", canon, prob)
        return canon, prob
    hint = _text_hint(text)
    if hint:
        _dbg("regex hint →", hint)
        return hint, max(prob, 0.78)
    t = (text or "").strip()
    if len(t) >= 6 and not _is_greeting(t):
        cached = _llm_route_cached(t.lower())
        if cached:
            _dbg("llm route →", cached)
            return cached
    _dbg("fallback neutral-ish →", canon, prob)
    return canon, prob

# Public API
def make_patch(label: str, prob: float, persona: str, text: Optional[str] = None) -> Patch:
    emo, conf = _resolve_emotion(label, prob, text)

    p = Patch()
    p.user_preface = EMPATHY.get(emo, EMPATHY["neutral"])
    p.system_addendum = STYLE.get(persona, STYLE.get("therapist", ""))

    if emo == "anxious":
        p.tool_hint = "Breathing"; p.max_questions = 1
    elif emo == "angry":
        p.tool_hint = "ConflictStyle"; p.max_questions = 1
    elif emo == "sad":
        p.tool_hint = "Stretch"; p.max_questions = 1

    if text and CRISIS_RX.search(text):
        p.safety = "crisis"
    return p

def build_context(text: str) -> Dict[str, Any]:
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
    if not text or not text.strip():
        return None
    ctx = build_context(text)
    return ctx or None

__all__ = ["Patch", "make_patch", "build_context", "maybe_build_context"]

# ─────────────────────────────────────────────────────────────────────────────
# CEL v2 causal reasoning (flag-gated)
# ─────────────────────────────────────────────────────────────────────────────

def _truthy_env(name: str) -> bool:
    return (os.getenv(name) or "").lower() in {"1","true","yes"}

def infer_causes(text: str, emotions: Dict[str, Any], sentiment: Dict[str, Any], entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Lightweight heuristics to produce ≤3 causal hypotheses.
    Inputs use fields from analyze_text():
      emotions: expects v2 bundle {labels:[{label,score}], probs:{...}} when available
      sentiment: {label,pos,neu,neg}
      entities:  spaCy entities [{text,label,...}]
    """
    t = (text or "").lower()
    labels = [l.get("label","") for l in (emotions.get("labels") or [])][:3] if isinstance(emotions, dict) else []
    probs = emotions.get("probs") if isinstance(emotions, dict) else {}
    ents = [e.get("text","") for e in (entities or []) if (e.get("label") in {"PERSON","ORG","GPE"})]
    out: List[Dict[str, Any]] = []

    def push(reason: str, ev: List[str], conf: float):
        if len(out) < 3:
            out.append({"reason": reason, "evidence": ev[:4], "confidence": round(max(0.0, min(1.0, conf)), 2)})

    # Family/school/work topics
    if any(k in t for k in ("mom","dad","parent","sister","brother")):
        push("conflict_with_parent", [w for w in ("mom","dad","parent") if w in t], 0.72)
    if any(k in t for k in ("teacher","exam","school","grades")):
        push("school_pressure", [w for w in ("exam","school","grades") if w in t], 0.68)
    if any(k in t for k in ("boss","coworker","work","deadline")):
        push("work_stress", [w for w in ("boss","work","deadline") if w in t], 0.7)

    # Emotion-informed cues
    if "anger" in " ".join(labels) or any(w in t for w in ("furious","pissed","mad")):
        push("interpersonal_conflict", [*labels, *ents][:4], 0.7)
    if "anxiety" in " ".join(labels) or any(w in t for w in ("panic","overthinking","nervous")):
        push("uncertainty_or_risk", [*labels, *(["panic"] if "panic" in t else [])], 0.66)
    if "sadness" in " ".join(labels) or any(w in t for w in ("lonely","down","empty")):
        push("loss_or_disconnection", [*labels, *(["lonely"] if "lonely" in t else [])], 0.65)

    # LLM backstop only if very weak signal
    if not out and _truthy_env("CEL_USE_LLM") and llm_semantic_emotion:
        try:
            data = llm_semantic_emotion(t)
            if isinstance(data, dict) and data.get("label"):
                push(f"llm_{str(data['label']).lower()}", ["llm"], float(data.get("confidence") or 0.6))
        except Exception:
            pass
    return out

def detect_masking(text: str, emotions: Dict[str, Any], sentiment: Dict[str, Any]) -> Dict[str, Any]:
    t = (text or "").lower()
    cues: List[str] = []
    # Contradictory phrases + emojis
    if "i'm fine" in t or "im fine" in t:
        cues.append("im_fine")
    if "lol" in t or "jk" in t or "lmao" in t:
        cues.append("humor")
    if any(x in t for x in ("😭","😂","crying face")) and ("lol" in t or "lmao" in t):
        cues.append("mixed_emojis")
    # Emotion vs sentiment mismatch
    pos = float(sentiment.get("pos", 0.0) or 0.0)
    neg = float(sentiment.get("neg", 0.0) or 0.0)
    emo_labels = " ".join([l.get("label","") for l in (emotions.get("labels") or [])]) if isinstance(emotions, dict) else ""
    if ("sad" in emo_labels or "anger" in emo_labels) and pos > 0.6:
        cues.append("pos_sentiment_vs_neg_emotion")
    if len(cues) >= 2:
        return {"masking": True, "cues": cues[:4]}
    return {"masking": False, "cues": cues[:4]}

def attribute_targets(text: str, entities: List[Dict[str, Any]]) -> Dict[str, Any]:
    t = (text or "").lower()
    self_ref = any(w in t.split() for w in ("i","me","my","myself"))
    other = None
    topic = None
    # Prefer PERSON entities
    for e in entities or []:
        if e.get("label") == "PERSON":
            other = e.get("text")
            break
    if not other:
        for k in ("mom","dad","sister","brother","boss","teacher","friend"):
            if k in t:
                other = k
                break
    for k in ("exam","school","work","job","deadline","grades"):
        if k in t:
            topic = k
            break
    return {"self": bool(self_ref), "other": other, "topic": topic}

def summarize_state(prev_va: Optional[List[Tuple[float,float]]], new_va: Tuple[float,float], window: int = 10) -> Dict[str, float]:
    hist = list(prev_va or []) + [new_va]
    hist = hist[-max(1, int(window)) :]
    if not hist:
        return {"rollValence": new_va[0], "rollArousal": new_va[1]}
    rv = sum(v for v,_ in hist) / len(hist)
    ra = sum(a for _,a in hist) / len(hist)
    return {"rollValence": round(rv, 4), "rollArousal": round(ra, 4)}

def cel_reason(text: str, history: Optional[List[Tuple[float,float]]] = None, overrides: Optional[Dict[str, Any]] = None, e2e: bool = False) -> Dict[str, Any]:
    """
    Entry point for causal bundle. Flag-gated by CEL_V2_CAUSAL to preserve prod behavior.
    Returns compact dict or empty dict if disabled/unavailable.
    """
    flags_causal = _truthy_env("CEL_V2_CAUSAL")
    flags_personal = (os.getenv("EMOTION_PERSONALIZE") or "").lower() in {"1","true","yes"}
    if not (flags_causal or flags_personal):
        return {}
    if not analyze_text or not text or not text.strip():
        return {}
    try:
        nlp = analyze_text(text)
        emotions = nlp.get("emotions") or {"labels": nlp.get("emotion", {}).get("scores", [])[:3], "probs": {}}
        sentiment = nlp.get("sentiment", {})
        entities = nlp.get("entities", []) or []
        v = float(nlp.get("valence", 0.0) or 0.0)
        a = float(nlp.get("arousal", 0.0) or 0.0)
        out: Dict[str, Any] = {}
        if flags_causal:
            causes = infer_causes(text, emotions, sentiment, entities)
            masking = detect_masking(text, emotions, sentiment)
            targets = attribute_targets(text, entities)
            out.update({"causes": causes, "masking": masking, "targets": targets})
        # Personalization (compute-only)
        if flags_personal:
            # Choose baseline method (EMA optional via env flag)
            use_ema = _truthy_env("EMOTION_PERSONALIZE_EMA")
            hist: List[Tuple[float, float]] = list(history or [])
            bl = ema_baseline(hist) if use_ema else user_baseline(hist)
            # Previous deviation for hysteresis (computed from last history point vs prior baseline)
            prev_dev: Optional[float] = None
            if len(hist) >= 1:
                prev_hist = hist[:-1]
                prev_bl = ema_baseline(prev_hist) if use_ema else user_baseline(prev_hist)
                pv, pa = hist[-1]
                prev_dev = deviation_score(pv, pa, prev_bl)

            dev = deviation_score(v, a, bl)
            # E2E-only overrides: honored only if caller passes e2e=True
            if e2e and overrides:
                odev = overrides.get("dev")
                try:
                    if odev is not None:
                        dev = max(0.0, min(4.0, float(odev)))
                except Exception:
                    pass
            ab = _truthy_env("EMOTION_PERSONALIZE_AB")
            if e2e and overrides and ("ab" in overrides):
                try:
                    ab = bool(overrides.get("ab"))
                except Exception:
                    pass
            adapt = adaptation_hint(dev, float((nlp.get("toxicity") or {}).get("score", 0.0) or 0.0), out.get("masking", {}).get("masking", False) if out else False, prev_dev, ab)
            out.update({
                "personalization": {
                    "muV": bl["muV"], "muA": bl["muA"],
                    "sigmaV": bl["sigmaV"], "sigmaA": bl["sigmaA"],
                    "dev": dev,
                    "prevDev": prev_dev,
                },
                "adaptation": adapt,
            })
            # Also compute rolling state for downstream UX
            roll = summarize_state(history or [], (v, a))
            out.update(roll)
        return out
    except Exception:
        return {}

__all__ += [
    "infer_causes",
    "detect_masking",
    "attribute_targets",
    "summarize_state",
    "cel_reason",
]

# ─────────────────────────────────────────────────────────────────────────────
# Personalization helpers (EMOTION_PERSONALIZE)
# ─────────────────────────────────────────────────────────────────────────────

def user_baseline(history_va: List[Tuple[float, float]], window: int = 20) -> Dict[str, float]:
    """Compute mean and std for recent VA history. Stable when empty.
    Returns {muV, muA, sigmaV, sigmaA} with mu in [-1,1] and sigma floored.
    """
    hist = list(history_va or [])[-max(1, int(window)) :]
    if not hist:
        return {"muV": 0.0, "muA": 0.0, "sigmaV": 0.35, "sigmaA": 0.35}
    vs = [max(-1.0, min(1.0, float(v))) for v,_ in hist]
    as_ = [max(-1.0, min(1.0, float(a))) for _,a in hist]
    muV = sum(vs)/len(vs)
    muA = sum(as_)/len(as_)
    def _std(xs: List[float]) -> float:
        if len(xs) <= 1:
            return 0.35
        m = sum(xs)/len(xs)
        var = sum((x-m)**2 for x in xs)/ (len(xs)-1)
        return max(0.1, (var ** 0.5))
    sigmaV = _std(vs)
    sigmaA = _std(as_)
    return {"muV": round(muV,4), "muA": round(muA,4), "sigmaV": round(sigmaV,4), "sigmaA": round(sigmaA,4)}

def ema_baseline(history_va: List[Tuple[float, float]], alpha: float = 0.2) -> Dict[str, float]:
    """Exponential moving average baseline with EW variance.
    alpha in (0,1]; higher = more weight on recent. Returns same keys as user_baseline.
    """
    hist = list(history_va or [])
    if not hist:
        return {"muV": 0.0, "muA": 0.0, "sigmaV": 0.35, "sigmaA": 0.35}
    # Clamp inputs
    hist = [(max(-1.0, min(1.0, float(v))), max(-1.0, min(1.0, float(a)))) for v,a in hist]
    # Initialize with first sample
    muV = hist[0][0]; muA = hist[0][1]
    varV = 0.0; varA = 0.0
    a = max(1e-3, min(1.0, float(alpha)))
    for (v,a_) in hist[1:]:
        # V
        dv = v - muV
        muV = (1 - a) * muV + a * v
        varV = (1 - a) * (varV + a * (dv ** 2))
        # A
        da = a_ - muA
        muA = (1 - a) * muA + a * a_
        varA = (1 - a) * (varA + a * (da ** 2))
    sigmaV = max(0.1, varV ** 0.5)
    sigmaA = max(0.1, varA ** 0.5)
    return {"muV": round(muV,4), "muA": round(muA,4), "sigmaV": round(sigmaV,4), "sigmaA": round(sigmaA,4)}

def deviation_score(currV: float, currA: float, baseline: Dict[str, float]) -> float:
    """Combined z-score magnitude across V and A with clamping to [0, 4]."""
    muV = float(baseline.get("muV", 0.0)); muA = float(baseline.get("muA", 0.0))
    sV = max(1e-3, float(baseline.get("sigmaV", 0.35)))
    sA = max(1e-3, float(baseline.get("sigmaA", 0.35)))
    zV = abs(float(currV) - muV) / sV
    zA = abs(float(currA) - muA) / sA
    dev = (zV**2 + zA**2) ** 0.5
    return round(max(0.0, min(4.0, dev)), 3)

def adaptation_hint(dev: float, toxicity: float, masking: bool, prev_dev: Optional[float] = None, ab: bool = False) -> Dict[str, Any]:
    """Map deviation + toxicity/masking to tone and small budget multiplier adjustment.
    Hysteresis: once above a threshold, require a margin below to switch down.
    AB: when ab=True, make thresholds slightly easier to reach (−0.2).
    Returns {tone: "calming"|"direct"|"normal", budgetMultiplier: 0.6..1.1}
    """
    tone = "normal"
    mult = 1.0
    tox = float(toxicity or 0.0)
    # Direct override stays highest priority
    if tox >= 0.7 or masking:
        tone = "direct"; mult = 0.8
    else:
        # Base thresholds
        t1 = 1.0
        t2 = 2.0
        if ab:
            t1 -= 0.2; t2 -= 0.2
        # Hysteresis margin
        h = 0.15
        # Decide calming levels with hysteresis using prev_dev
        if dev >= t2 or (prev_dev is not None and prev_dev >= t2 and dev >= (t2 - h)):
            tone = "calming"; mult = 1.1
        elif dev >= t1 or (prev_dev is not None and prev_dev >= t1 and dev >= (t1 - h)):
            tone = "calming"; mult = 1.05
        elif dev <= max(0.0, t1 - 0.5):
            tone = "normal"; mult = 0.95
    return {"tone": tone, "budgetMultiplier": round(max(0.6, min(1.1, mult)), 2)}

__all__ += ["user_baseline", "ema_baseline", "deviation_score", "adaptation_hint"]
