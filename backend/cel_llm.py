# -*- coding: utf-8 -*-
"""
cel_llm.py — Semantic emotion router (LLM-backed, hardened)

Purpose
- Map arbitrary user text/slang to a small, canonical label set the rest of Slurpy understands.

Behavior
- Cheap fast paths (greetings/short/obvious) avoid LLM calls.
- Light heuristics map common phrases to allowed labels.
- Otherwise calls OpenAI Chat Completions with JSON response_format.
"""

from __future__ import annotations

import os
import re
import json
from typing import Optional, Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from openai import OpenAI
else:
    try:
        from openai import OpenAI
    except Exception:
        OpenAI = None  # type: ignore

# Canonical labels the router is allowed to return
_ALLOWED = ["anxious", "angry", "sad", "foggy", "meaning", "neutral"]

# Optional hints; not used here directly but handy for upstream tools
TOOL_HINT = {"anxious": "Breathing", "angry": "ConflictStyle", "sad": "Stretch"}

# ------------------------------ utilities ------------------------------------
def _redact(text: str) -> str:
    """Light redaction to avoid sending obvious identifiers; keep prompt tight."""
    t = re.sub(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", "[email]", text or "")
    t = re.sub(r"\b\+?\d[\d\-\s]{7,}\b", "[phone]", t)
    return t[:512]  # bound request size a bit

def _client() -> Optional["OpenAI"]:
    key = os.getenv("OPENAI_API_KEY")
    if not key or OpenAI is None:
        return None
    try:
        return OpenAI(api_key=key)
    except Exception:
        return None

def _is_greeting(t: str) -> bool:
    t = (t or "").strip().lower()
    return t in {"hi", "hey", "hello", "yo", "sup", "hiya"} or (
        len(t) <= 3 and t in {"hi", "yo"}
    )

# Quick heuristic mapping to keep cost/latency low on obvious cases
_HEUR_MAP = [
    (re.compile(r"\boverwhelm|\bpanic|\banx|spiral|overthink|stressed", re.I), "anxious"),
    (re.compile(r"\bangry|mad|furious|pissed|annoyed|irritat", re.I), "angry"),
    (re.compile(r"\bsad|down|depress|tear|cry|blue|empty|numb", re.I), "sad"),
    (re.compile(r"\bfoggy|can[’']?t think|brain fog|confus", re.I), "foggy"),
    (re.compile(r"\bwhy am i\b|\bwhat'?s going on\b|\bmeaning\b|\bmake sense\b", re.I), "meaning"),
]

def _heuristic_label(text: str) -> Optional[str]:
    t = (text or "").strip()
    if not t or _is_greeting(t):
        return "neutral"
    for rx, lbl in _HEUR_MAP:
        if rx.search(t):
            return lbl
    # very short non-greeting → neutral
    if len(t.split()) <= 2:
        return "neutral"
    return None

def _extract_content(resp: Any) -> Optional[str]:
    """
    Robustly extract assistant text from OpenAI Chat Completions response,
    handling both typed and dict-like responses.
    """
    if resp is None:
        return None
    try:
        # Newer SDK: resp.choices[0].message.content
        choices = getattr(resp, "choices", None)
        if choices:
            first = choices[0]
            message = getattr(first, "message", None)
            if message is not None:
                content = getattr(message, "content", None)
                if content:
                    return str(content)
            # Some SDKs also set .text on the choice
            if hasattr(first, "text") and first.text:
                return str(first.text)

        # Dict-like fallback
        if isinstance(resp, dict):
            ch = resp.get("choices") or []
            if ch:
                msg = ch[0].get("message") or {}
                return msg.get("content") or ch[0].get("text")

    except Exception:
        pass
    return None

# ------------------------------ main entry -----------------------------------
def llm_semantic_emotion(text: str) -> Optional[Dict[str, Any]]:
    """
    Ask GPT to map arbitrary language/slang to our canonical set.
    Returns dict: {"label": <one of _ALLOWED>, "confidence": float, "reason": str?}
    """
    # 1) Fast paths: greetings/short/obvious → avoid LLM
    h = _heuristic_label(text)
    if h in _ALLOWED:
        # mid confidence since we used heuristics
        return {"label": h, "confidence": 0.55, "reason": "heuristic"}

    # 2) LLM path
    cli = _client()
    if cli is None:
        print("⚠️ [cel_llm] No OpenAI client available")
        return None

    model = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4o-mini")
    red = _redact(text)

    system_prompt = (
        "You are a strict emotion router. "
        f"Return a JSON object with keys: label (one of {', '.join(_ALLOWED)}), "
        "confidence (0..1), and optional reason (short). "
        "If unclear, choose 'neutral'. Respond with JSON only."
    )

    try:
        print(f"🔍 [cel_llm] Calling OpenAI with model: {model}")
        resp = cli.chat.completions.create(
            model=model,
            temperature=0,  # deterministic routing
            max_tokens=120,
            response_format={"type": "json_object"},  # force JSON
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": red},
            ],
        )

        raw = _extract_content(resp)
        if not raw:
            print("⚠️ [cel_llm] OpenAI returned empty content")
            return None

        clean = raw.strip()
        # Strip accidental code fences
        if clean.startswith("```"):
            clean = clean.strip("`").strip()
            if clean.lower().startswith("json"):
                clean = clean[4:].strip()

        try:
            data = json.loads(clean)
        except json.JSONDecodeError as e:
            print(f"❌ [cel_llm] JSON decode error: {e}")
            print(f"❌ [cel_llm] Raw content was: {repr(clean)}")
            return None

        label = str(data.get("label", "")).strip().lower()
        conf = float(data.get("confidence", 0.0) or 0.0)

        if label not in _ALLOWED:
            print(f"⚠️ [cel_llm] Invalid label '{label}', expected one of: {_ALLOWED}")
            return None

        # Clamp confidence to a sane range
        conf = max(0.0, min(1.0, conf))

        print(f"✅ [cel_llm] Success: {label} ({conf:.2f})")
        out = {"label": label, "confidence": conf}
        if data.get("reason"):
            out["reason"] = str(data["reason"])[:200]
        return out

    except Exception as e:
        print(f"❌ [cel_llm] Exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return None
