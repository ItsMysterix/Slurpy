# backend/roleplay.py
from __future__ import annotations

import datetime
from typing import Any, Dict, List, Optional, cast

# Import the module, not specific names — then resolve what exists.
from . import analytics as _ana  # type: ignore[attr-defined]

# ---------- Resolve analytics read/write functions dynamically ----------
def _resolve_read():
    for name in ("_get_analysis", "get_analysis", "read_analysis", "fetch_analysis"):
        fn = getattr(_ana, name, None)
        if callable(fn):
            return fn
    return None

def _resolve_write():
    for name in ("_update_analysis", "update_analysis", "write_analysis", "save_analysis"):
        fn = getattr(_ana, name, None)
        if callable(fn):
            return fn
    return None

_read_analysis = _resolve_read()
_write_analysis = _resolve_write()

# Fallback setter if no analysis writer exists (uses session fields)
_set_session_fields = getattr(_ana, "set_session_fields", None)

def _get_analysis_blob(session_id: str) -> Dict[str, Any]:
    if callable(_read_analysis):
        try:
            result = _read_analysis(session_id)
            if isinstance(result, dict):
                return result
            # If the reader returned None or a non-dict value, fall through to returning empty dict.
        except Exception:
            pass
    # As a last resort, return an empty blob; summarize() will handle empty safely.
    return {}

def _update_analysis_blob(session_id: str, analysis: Dict[str, Any]) -> None:
    if callable(_write_analysis):
        try:
            _write_analysis(session_id, analysis)
            return
        except Exception:
            pass
    # Fallback: best-effort write into session fields if available.
    if callable(_set_session_fields):
        try:
            # store roleplay under a namespaced key without clobbering other session fields
            _set_session_fields(session_id, roleplay=analysis.get("roleplay", []))
            return
        except Exception:
            pass
    # If we reach here, we silently no-op to avoid crashing the app.

# ---------- Canonical persona definitions ----------
PERSONAS: Dict[str, Dict[str, str]] = {
    "parent": {
        "name": "Parent",
        "system": "You are the user's parent. Speak in first-person as their parent with warmth and realism.",
    },
    "partner": {
        "name": "Partner",
        "system": "You are the user's partner. Be supportive and kind.",
    },
    "boss": {
        "name": "Boss",
        "system": "You are the user's manager. Be clear and constructive.",
    },
    "inner_critic": {
        "name": "Inner Critic",
        "system": "You are the user's inner critic, softened into helpful guidance.",
    },
    "self_compassion": {
        "name": "Self-Compassion",
        "system": "You are the user's compassionate self. Speak gently.",
    },
}

def _utc_iso() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"

def record(session_id: str, persona: str, speaker: str, text: str, turn: int) -> None:
    """
    Append a roleplay turn into the analysis blob.
    Entry schema:
    {
      "persona": str, "speaker": str, "text": str, "turn": int, "timestamp": str
    }
    """
    analysis = _get_analysis_blob(session_id)
    rp: List[Dict[str, Any]] = cast(List[Dict[str, Any]], analysis.get("roleplay", []))
    if not isinstance(rp, list):
        rp = []

    rp.append({
        "persona": persona,
        "speaker": speaker,
        "text": text,
        "turn": turn,
        "timestamp": _utc_iso(),
    })

    analysis["roleplay"] = rp
    _update_analysis_blob(session_id, analysis)

def summarize(session_id: str) -> Dict[str, str]:
    """
    Return quick extracts:
      - summary: concatenated user lines (<=1000 chars)
      - patterns: concatenated persona lines (<=1000 chars)
    """
    analysis = _get_analysis_blob(session_id)
    rp: List[Dict[str, Any]] = analysis.get("roleplay") or []
    if not rp:
        return {"summary": "", "patterns": ""}

    user_lines = [str(r.get("text", "")) for r in rp if r.get("speaker") == "user"]
    persona_lines = [str(r.get("text", "")) for r in rp if r.get("speaker") != "user"]

    return {
        "summary": (" ".join(user_lines)).strip()[:1000],
        "patterns": (" ".join(persona_lines)).strip()[:1000],
    }
