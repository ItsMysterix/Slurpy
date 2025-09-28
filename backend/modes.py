# -*- coding: utf-8 -*-
"""
modes.py — Personality modes registry (prod-ready)

Stable contract used elsewhere:
  - DEFAULT_MODE
  - available()  -> list[{id, emoji, name, description}]
  - config(id)   -> dict for that mode or default

Notes
-----
• Zero external deps; safe to import early.
• Validates required keys at import (no hard crash; falls back).
• Extra helpers (get_ids, is_valid, get_default) are non-breaking.
"""

from __future__ import annotations

from typing import Dict, List, TypedDict, Any

# ─────────────────────────────────────────────────────────────────────────────
# Types
class ModeSpec(TypedDict):
    emoji: str
    name: str
    description: str
    system_prompt: str

# ─────────────────────────────────────────────────────────────────────────────
# Registry
MODES: Dict[str, ModeSpec] = {
    "therapist": {
        "emoji": "🧘",
        "name": "Therapist",
        "description": "Skilled listener; reflective and validating.",
        "system_prompt": (
            "You are a compassionate therapist. Listen closely, reflect, validate, and follow the client's lead. "
            "Use natural language and specific references; avoid clichés."
        ),
    },
    "friend": {
        "emoji": "🧑‍🤝‍🧑",
        "name": "Friend",
        "description": "Warm, casual, caring.",
        "system_prompt": "You are a warm friend. Be supportive and down-to-earth.",
    },
    "coach": {
        "emoji": "🥊",
        "name": "Coach",
        "description": "Action-focused, encouraging.",
        "system_prompt": "You are a motivational coach. Encourage small, concrete steps and accountability.",
    },
    # Roleplay modes (kept here to avoid circular imports with roleplay.py)
    "parent": {
        "emoji": "👪",
        "name": "Parent",
        "description": "Roleplay as a caring parent.",
        "system_prompt": "You roleplay as the user's parent with warmth and boundaries.",
    },
    "partner": {
        "emoji": "💞",
        "name": "Partner",
        "description": "Roleplay as a supportive partner.",
        "system_prompt": "You roleplay as the user's partner: supportive, honest, kind.",
    },
    "boss": {
        "emoji": "💼",
        "name": "Boss",
        "description": "Roleplay manager for practice.",
        "system_prompt": "You roleplay as the user's manager: professional, constructive.",
    },
    "inner_critic": {
        "emoji": "🪞",
        "name": "Inner Critic",
        "description": "Soften the critic into guidance.",
        "system_prompt": "Translate harsh self-talk into helpful guidance and values.",
    },
    "self_compassion": {
        "emoji": "🌿",
        "name": "Self-Compassion",
        "description": "Practice kind self-talk.",
        "system_prompt": "Offer kind, encouraging, realistic self-compassion.",
    },
}

DEFAULT_MODE: str = "therapist"

# ─────────────────────────────────────────────────────────────────────────────
# Internal validation (soft)
_REQ_KEYS = ("emoji", "name", "description", "system_prompt")

def _valid(spec: Any) -> bool:
    return isinstance(spec, dict) and all(k in spec for k in _REQ_KEYS)

# Ensure all entries are well-formed; if not, drop them to avoid runtime KeyErrors.
_bad_keys: List[str] = [k for k, v in list(MODES.items()) if not _valid(v)]
for _k in _bad_keys:
    MODES.pop(_k, None)

# If default got removed by validation (shouldn’t happen), repair.
if DEFAULT_MODE not in MODES:
    # Pick any remaining mode or recreate a minimal therapist mode.
    if MODES:
        DEFAULT_MODE = next(iter(MODES.keys()))
    else:
        MODES["therapist"] = {
            "emoji": "🧘",
            "name": "Therapist",
            "description": "Skilled listener; reflective and validating.",
            "system_prompt": (
                "You are a compassionate therapist. Listen closely, reflect, validate, and follow the client's lead."
            ),
        }
        DEFAULT_MODE = "therapist"

# ─────────────────────────────────────────────────────────────────────────────
# Public API (backward compatible)
def available() -> List[dict]:
    """Return a lightweight list for UI selectors."""
    return [
        {"id": k, "emoji": v["emoji"], "name": v["name"], "description": v["description"]}
        for k, v in MODES.items()
    ]

def config(mode: str) -> ModeSpec:
    """Return the full config for a mode ID, falling back to DEFAULT_MODE."""
    if mode in MODES:
        return MODES[mode]
    return MODES[DEFAULT_MODE]

# ─────────────────────────────────────────────────────────────────────────────
# Convenience helpers (non-breaking; used by API layer defensively)
def get_ids() -> List[str]:
    return list(MODES.keys())

def is_valid(mode: str) -> bool:
    return mode in MODES

def get_default() -> str:
    return DEFAULT_MODE

__all__ = ["MODES", "DEFAULT_MODE", "available", "config", "get_ids", "is_valid", "get_default"]
