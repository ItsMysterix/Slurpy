# -*- coding: utf-8 -*-
"""
roleplay.py — Persona roleplay logging & utilities (prod-ready)

Features
--------
• Dynamic analytics read/write resolution (back-compat with your analytics.py)
• Append roleplay turns into the per-session analysis blob
• Bounded history (prunes oldest turns to avoid unbounded growth)
• Safe text length clamp
• Helper APIs: get_personas(), get_system_for(), get_history(), summarize()
• Async-friendly helpers (record_async, record_many)

Env
---
ROLEPLAY_MAX_TURNS   → max kept turns per session (default: 400)
ROLEPLAY_MAX_CHARS   → max chars per message stored (default: 2000)
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Callable, cast
from datetime import datetime, timezone

# Import the module (not names) so we can resolve functions that exist.
from . import analytics as _ana  # type: ignore[attr-defined]

# ─────────────────────────────────────────────────────────────────────────────
# Config
_MAX_TURNS = int(os.getenv("ROLEPLAY_MAX_TURNS", "400"))
_MAX_CHARS = int(os.getenv("ROLEPLAY_MAX_CHARS", "2000"))

# ─────────────────────────────────────────────────────────────────────────────
# Analytics read/write resolution (memoized)
def _resolve(name_candidates: List[str]) -> Optional[Callable[..., Any]]:
    for nm in name_candidates:
        fn = getattr(_ana, nm, None)
        if callable(fn):
            return fn
    return None

_READ_ANALYSIS = _resolve(["_get_analysis", "get_analysis", "read_analysis", "fetch_analysis"])
_WRITE_ANALYSIS = _resolve(["_update_analysis", "update_analysis", "write_analysis", "save_analysis"])
_SET_SESSION_FIELDS = getattr(_ana, "set_session_fields", None)

def _get_analysis_blob(session_id: str) -> Dict[str, Any]:
    if callable(_READ_ANALYSIS):
        try:
            out = _READ_ANALYSIS(session_id)  # type: ignore[misc]
            return out if isinstance(out, dict) else {}
        except Exception:
            return {}
    return {}

def _update_analysis_blob(session_id: str, analysis: Dict[str, Any]) -> None:
    # Primary path: write to analysis blob
    if callable(_WRITE_ANALYSIS):
        try:
            _WRITE_ANALYSIS(session_id, analysis)  # type: ignore[misc]
            return
        except Exception:
            pass
    # Fallback: stash roleplay field on the session row (best-effort)
    if callable(_SET_SESSION_FIELDS):
        try:
            _SET_SESSION_FIELDS(session_id, roleplay=analysis.get("roleplay", []))  # type: ignore[misc]
            return
        except Exception:
            pass
    # Last resort: no-op (never raise)

# ─────────────────────────────────────────────────────────────────────────────
# Personas (kept minimal and human)
PERSONAS: Dict[str, Dict[str, str]] = {
    "parent": {
        "id": "parent",
        "name": "Parent",
        "system": "You are the user's parent. Speak in first-person as their parent with warmth and realism.",
        "description": "Warm, supportive, realistic parental voice.",
    },
    "partner": {
        "id": "partner",
        "name": "Partner",
        "system": "You are the user's partner. Be supportive and kind.",
        "description": "Caring partner who listens and supports.",
    },
    "boss": {
        "id": "boss",
        "name": "Boss",
        "system": "You are the user's manager. Be clear and constructive.",
        "description": "Managerial tone; clear, fair, and actionable.",
    },
    "inner_critic": {
        "id": "inner_critic",
        "name": "Inner Critic",
        "system": "You are the user's inner critic, softened into helpful guidance.",
        "description": "Turns harsh inner voice into constructive guidance.",
    },
    "self_compassion": {
        "id": "self_compassion",
        "name": "Self-Compassion",
        "system": "You are the user's compassionate self. Speak gently.",
        "description": "Gentle, caring inner ally; validates and soothes.",
    },
}

_DEFAULT_PERSONA_ID = "self_compassion"

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
def _utc_iso_z() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _clamp_text(s: str) -> str:
    s = s or ""
    return s[:_MAX_CHARS] if len(s) > _MAX_CHARS else s

def get_personas() -> List[Dict[str, str]]:
    """List personas for UI (id, name, description)."""
    return [
        {"id": v["id"], "name": v["name"], "description": v.get("description", "")}
        for v in PERSONAS.values()
    ]

def get_system_for(persona: str) -> str:
    """Return the system prompt for a persona, with safe fallback."""
    p = PERSONAS.get(persona) or PERSONAS.get(_DEFAULT_PERSONA_ID)
    return p["system"] if p else "You are warm, clear, and helpful."

# ─────────────────────────────────────────────────────────────────────────────
# Public API
def record(session_id: str, persona: str, speaker: str, text: str, turn: int) -> None:
    """
    Append a roleplay turn into the analysis blob.

    Entry schema:
      { "persona": str, "speaker": str, "text": str, "turn": int, "timestamp": str }
    """
    analysis = _get_analysis_blob(session_id)
    rp: List[Dict[str, Any]] = cast(List[Dict[str, Any]], analysis.get("roleplay", []))
    if not isinstance(rp, list):
        rp = []

    persona_id = persona if persona in PERSONAS else _DEFAULT_PERSONA_ID

    rp.append({
        "persona": persona_id,
        "speaker": (speaker or "assistant")[:32],
        "text": _clamp_text(text or ""),
        "turn": int(turn),
        "timestamp": _utc_iso_z(),
    })

    # Prune to bounded size (keep most recent)
    if len(rp) > _MAX_TURNS:
        rp = rp[-_MAX_TURNS:]

    analysis["roleplay"] = rp
    _update_analysis_blob(session_id, analysis)

def record_many(session_id: str, entries: List[Dict[str, Any]]) -> None:
    """
    Append multiple turns at once. Each entry expects keys:
      persona, speaker, text, turn
    """
    if not entries:
        return
    analysis = _get_analysis_blob(session_id)
    rp: List[Dict[str, Any]] = cast(List[Dict[str, Any]], analysis.get("roleplay", []))
    if not isinstance(rp, list):
        rp = []

    for e in entries:
        persona = str(e.get("persona") or _DEFAULT_PERSONA_ID)
        speaker = str(e.get("speaker") or "assistant")
        text = str(e.get("text") or "")
        turn = int(e.get("turn") or 0)
        rp.append({
            "persona": persona if persona in PERSONAS else _DEFAULT_PERSONA_ID,
            "speaker": speaker[:32],
            "text": _clamp_text(text),
            "turn": turn,
            "timestamp": _utc_iso_z(),
        })

    if len(rp) > _MAX_TURNS:
        rp = rp[-_MAX_TURNS:]

    analysis["roleplay"] = rp
    _update_analysis_blob(session_id, analysis)

async def record_async(session_id: str, persona: str, speaker: str, text: str, turn: int) -> None:
    """Async-friendly wrapper that offloads to a thread."""
    import asyncio
    await asyncio.to_thread(record, session_id, persona, speaker, text, turn)

def get_history(session_id: str, last_n: int = 50) -> List[Dict[str, Any]]:
    """
    Return the latest N roleplay items (most recent last).
    """
    analysis = _get_analysis_blob(session_id)
    rp: List[Dict[str, Any]] = analysis.get("roleplay") or []
    if not isinstance(rp, list):
        return []
    if last_n <= 0:
        return []
    return rp[-last_n:]

def summarize(session_id: str) -> Dict[str, str]:
    """
    Return quick extracts:
      - summary: concatenated user lines (<=1000 chars)
      - patterns: concatenated persona lines (<=1000 chars)
    """
    analysis = _get_analysis_blob(session_id)
    rp: List[Dict[str, Any]] = analysis.get("roleplay") or []
    if not isinstance(rp, list) or not rp:
        return {"summary": "", "patterns": ""}

    user_lines = [str(r.get("text", "")) for r in rp if r.get("speaker") == "user"]
    persona_lines = [str(r.get("text", "")) for r in rp if r.get("speaker") != "user"]

    return {
        "summary": (" ".join(user_lines)).strip()[:1000],
        "patterns": (" ".join(persona_lines)).strip()[:1000],
    }

__all__ = [
    "PERSONAS",
    "get_personas",
    "get_system_for",
    "record",
    "record_many",
    "record_async",
    "get_history",
    "summarize",
]
