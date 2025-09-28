# backend/safety.py
"""
Lightweight safety classifier with clear severity tiers and fast, compiled regexes.

Public API (backward-compatible with rag_core):
- classify(text: str) -> tuple[str | None, dict | None]
- crisis_message(memories: list[str] | None = None, region: str | None = None) -> str

Extras (optional):
- classify_async(text: str) -> tuple[str | None, dict | None]
- is_crisis(level: str | None) -> bool
"""

from __future__ import annotations

import re
import asyncio
from typing import List, Optional, Tuple, Dict, Any

__all__ = ["classify", "classify_async", "crisis_message", "is_crisis"]

# ---------------------------------------------------------------------
# Compiled patterns (case-insensitive, word-bounded to reduce false positives)
# Keep these conservative to avoid over-triggering.
# ---------------------------------------------------------------------
IMMEDIATE_PATTERNS = [
    # direct suicidal intent / death wish
    re.compile(r"\b(kill myself|end my life|take my life|end it all)\b", re.I),
    re.compile(r"\b(suicide|suicidal)\b", re.I),
    re.compile(r"\b(i (?:want|plan|intend|am going)\s+to\s+die)\b", re.I),
    re.compile(r"\b(i (?:don['’]?t|do not) want to live)\b", re.I),
    re.compile(r"\b(can['’]?t go on (?:anymore|any more))\b", re.I),
]

ELEVATED_PATTERNS = [
    # non-suicidal self injury or strong distress
    re.compile(r"\b(hurt myself|self[-\s]?harm|cut(?:ting| myself)|burn myself)\b", re.I),
    re.compile(r"\b(i can['’]?t cope)\b", re.I),
    re.compile(r"\b(i hate myself)\b", re.I),
]

# Signals that can *escalate* an elevated match to immediate
MEANS_PATTERNS = [
    re.compile(r"\b(pills?|overdose|od)\b", re.I),
    re.compile(r"\b(rope|noose)\b", re.I),
    re.compile(r"\b(gun|firearm)\b", re.I),
    re.compile(r"\b(knife|razor|blade)\b", re.I),
    re.compile(r"\b(bridge|train|jump)\b", re.I),
]

TIME_PATTERNS = [
    re.compile(r"\b(right now|tonight|this\s+(?:evening|night|weekend))\b", re.I),
    re.compile(r"\b(now|immediately)\b", re.I),
]

# ---------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------
def _match_any(patterns: List[re.Pattern], text: str) -> Optional[re.Match]:
    for pat in patterns:
        m = pat.search(text)
        if m:
            return m
    return None


def classify(text: str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Heuristic classification into {None, 'elevated', 'immediate'}.
    Returns (level, details). rag_core only reads the first item.

    Strategy:
      - If any IMMEDIATE pattern matches → 'immediate'
      - Else if any ELEVATED pattern matches → 'elevated'
        - but escalate to 'immediate' if also mentions MEANS or TIME
    """
    t = text or ""
    m_imm = _match_any(IMMEDIATE_PATTERNS, t)
    if m_imm:
        return "immediate", {"pattern": m_imm.re.pattern, "group": m_imm.group(0)}

    m_el = _match_any(ELEVATED_PATTERNS, t)
    if m_el:
        m_means = _match_any(MEANS_PATTERNS, t)
        m_time = _match_any(TIME_PATTERNS, t)
        if m_means or m_time:
            return "immediate", {
                "pattern": m_el.re.pattern,
                "group": m_el.group(0),
                "escalated_by": "means" if m_means else "time",
            }
        return "elevated", {"pattern": m_el.re.pattern, "group": m_el.group(0)}

    return None, None


async def classify_async(text: str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Async wrapper for classify(). Offloads to a thread so callers can use it
    without blocking an event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, classify, text)


def is_crisis(level: Optional[str]) -> bool:
    """True if level indicates a crisis that should route to crisis_message()."""
    return level in {"immediate", "elevated"}


# ---------------------------------------------------------------------
# Crisis message
# ---------------------------------------------------------------------
def crisis_message(memories: Optional[List[str]] = None, region: Optional[str] = None) -> str:
    """
    Returns a concise, action-oriented crisis message.
    - Always safe: directs to local emergency services.
    - US: includes 988 and Crisis Text Line (741741).
    - If memories mention a therapist, prompts them to reach out as well.
    """
    region = (region or "").upper()

    # Base, globally safe directive
    base = (
        "I'm concerned about your safety. Please contact your local emergency services now. "
    )

    # Region-specific additions (kept conservative and widely recognized)
    region_lines = {
        "US": "In the United States, you can call or text 988 (Suicide & Crisis Lifeline). "
              "You can also text HOME to 741741 (Crisis Text Line). ",
        "CA": "In Canada, you can call or text 988 (Suicide Crisis Helpline). ",
        "UK": "In the UK & ROI, you can contact Samaritans at 116 123. ",
        "AU": "In Australia, you can contact Lifeline at 13 11 14. ",
    }

    msg = base + region_lines.get(region, "")

    if memories and any("therap" in (m or "").lower() for m in memories):
        msg += "If you have a therapist or trusted contact, please reach out to them as well."

    return msg.strip()
