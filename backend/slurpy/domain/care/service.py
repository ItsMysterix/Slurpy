# backend/slurpy/domain/care/service.py
# -*- coding: utf-8 -*-
"""
Care kit composer (pure functions, no I/O).
"""

from __future__ import annotations

import random
from typing import List, Dict, Optional, Sequence, TypedDict

# ---------------------------------------------------------------------------
# Content banks (short, legible, safe)
# ---------------------------------------------------------------------------
SKILLS: Dict[str, List[str]] = {
    "anxiety": ["box breathing 4-4-4-4", "5-4-3-2-1 grounding", "worry postponement 15m"],
    "depression": ["behavioral activation: one tiny task", "gratitude: list 3 specifics", "sunlight + 10m walk"],
    "anger": ["urge surfing 90s", "paced breathing 4-6", "time-out + values check"],
    "relationships": ["DEAR MAN rehearsal", "boundary script", "repair attempt starter"],
    "trauma": ["safe place visualization", "orienting: name 3 objects", "container exercise"],
}

PSYCHOEDU: Dict[str, List[str]] = {
    "anxiety": ["Anxiety = overactive alarm; slow breath lowers arousal."],
    "depression": ["Activation precedes motivation; tiny wins build momentum."],
    "anger": ["Anger often protects other feelings; naming reduces intensity."],
    "relationships": ["Clear requests beat mind-reading; repair early."],
    "trauma": ["Grounding widens the window of tolerance."],
}

QUESTIONS: Dict[str, List[str]] = {
    "anxiety": ["What would feel 5% safer right now?"],
    "depression": ["What’s one tiny thing you can do in 2 minutes?"],
    "anger": ["What value do you want to stand for in this moment?"],
    "relationships": ["What outcome would be ‘good enough’ for now?"],
    "trauma": ["Is your body giving a cue you can soothe gently?"],
}

DEFAULTS: List[str] = ["notice-and-name your feeling", "do one kind thing for yourself today", "sip water + 3 slow breaths"]

GENERIC_EDU: List[str] = ["Emotions are signals; we can respond skillfully.", "Small, doable steps shift state more than big plans."]

GENERIC_QUESTIONS: List[str] = ["What would help by 1%?", "What’s the next small right step?"]

THEME_ALIAS: Dict[str, str] = {
    "ongoing_anxiety": "anxiety",
    "ongoing_depression": "depression",
    "ongoing_anger": "anger",
    "ongoing_relationships": "relationships",
    "ongoing_trauma": "trauma",
    "work_stress": "anxiety",
    "self_esteem": "depression",
}

MICRO_GOAL_TEXT = "Write one sentence: ‘Tonight I will __ for 2 minutes.’"


class CareKit(TypedDict):
    skill: str
    psychoedu: str
    micro_goal: str
    question: str
    approach: Optional[str]


def _canon_theme(themes: Sequence[str]) -> Optional[str]:
    if not themes:
        return None
    norm: List[str] = []
    for t in themes:
        if not t:
            continue
        tt = str(t).strip().lower().replace("ongoing_", "")
        tt = THEME_ALIAS.get(t, tt)
        norm.append(tt)
    for k in ("anxiety", "depression", "anger", "relationships", "trauma"):
        if k in norm:
            return k
    return None


def _pick(rng: random.Random, items: Sequence[str], fallback: Sequence[str]) -> str:
    pool = [s for s in items if isinstance(s, str) and s.strip()]
    if not pool:
        pool = [s for s in fallback if isinstance(s, str) and s.strip()] or ["(take a gentle breath)"]
    return rng.choice(pool)


def compose(themes: List[str], approach: Optional[str] = None, rng_seed: Optional[int] = None) -> CareKit:
    rng = random.Random(rng_seed) if rng_seed is not None else random.Random()
    key = _canon_theme(themes)

    if key is None:
        skill = _pick(rng, DEFAULTS, DEFAULTS)
        edu = _pick(rng, GENERIC_EDU, GENERIC_EDU)
        q = _pick(rng, GENERIC_QUESTIONS, GENERIC_QUESTIONS)
    else:
        skill = _pick(rng, SKILLS.get(key, []), DEFAULTS)
        edu = _pick(rng, PSYCHOEDU.get(key, []), GENERIC_EDU)
        q = _pick(rng, QUESTIONS.get(key, []), GENERIC_QUESTIONS)

    return CareKit(skill=skill, psychoedu=edu, micro_goal=MICRO_GOAL_TEXT, question=q, approach=approach)


__all__ = ["compose", "CareKit"]
