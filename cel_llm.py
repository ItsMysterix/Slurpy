# cel_llm.py
import os, re, json
from typing import Optional, Dict, Any

# OpenAI SDK optional: only used if OPENAI_API_KEY exists
try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore

_ALLOWED = ["anxious","angry","sad","foggy","meaning","neutral"]
_TOOL_HINT = {"anxious":"Breathing","angry":"ConflictStyle","sad":"Stretch"}

def _redact(text: str) -> str:
    """Light redaction to avoid sending obvious identifiers."""
    t = re.sub(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", "[email]", text)
    t = re.sub(r"\b\+?\d[\d\-\s]{7,}\b", "[phone]", t)
    t = re.sub(r"https?://\S+", "[url]", t)
    return t[:512]  # keep it tight

def _client():
    key = os.getenv("OPENAI_API_KEY")
    if not key or OpenAI is None:
        return None
    try:
        return OpenAI()
    except Exception:
        return None

_JSON_SCHEMA = {
    "name": "emotion_label_schema",
    "schema": {
        "type": "object",
        "properties": {
            "label": {"type": "string", "enum": _ALLOWED},
            "confidence": {"type": "number"},
            "reason": {"type": "string"}
        },
        "required": ["label","confidence"],
        "additionalProperties": False
    },
    "strict": True,
}

def llm_semantic_emotion(text: str) -> Optional[Dict[str, Any]]:
    """
    Ask GPT to map arbitrary language/slang to our canonical set.
    Returns: {"label": one-of(_ALLOWED), "confidence": float, "reason": str?}
    """
    cli = _client()
    if cli is None:
        return None

    model = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4o-mini")
    prompt_sys = (
        "You are a concise emotion router. "
        "Map the user's message to exactly one of these labels: "
        f"{', '.join(_ALLOWED)}. "
        "If unclear, choose 'neutral'. "
        "Return strict JSON only."
    )
    red = _redact(text)

    try:
        # Use chat completion without the unsupported `response_format` argument,
        # then extract the content and parse JSON manually.
        resp = cli.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": prompt_sys},
                {"role": "user", "content": red},
            ],
            max_tokens=150,
        )

        # Extract the raw text from the response in a robust way that works
        # whether the SDK returns dicts or objects.
        raw = None
        if isinstance(resp, dict):
            choices = resp.get("choices") or []
            if choices:
                # attempt to support both "message":{"content": ...} and legacy "text"
                msg = choices[0].get("message") or {}
                raw = msg.get("content") or choices[0].get("text")
        else:
            choices = getattr(resp, "choices", None)
            if choices:
                first = choices[0]
                message = getattr(first, "message", None)
                if isinstance(message, dict):
                    raw = message.get("content")
                else:
                    raw = getattr(message, "content", None) or getattr(first, "text", None)

        if not raw:
            return None

        data = json.loads(raw)
        label = data.get("label")
        conf = float(data.get("confidence", 0.0) or 0.0)
        if label not in _ALLOWED:
            return None
        return {"label": label, "confidence": conf, "reason": data.get("reason")}
    except Exception:
        return None
