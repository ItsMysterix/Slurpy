import os, re, json
from typing import Optional, Dict, Any

try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore

_ALLOWED = ["anxious","angry","sad","foggy","meaning","neutral"]
TOOL_HINT = {"anxious":"Breathing","angry":"ConflictStyle","sad":"Stretch"}

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

JSON_SCHEMA = {
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
        print("⚠️ [cel_llm] No OpenAI client available")
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
        print(f"🔍 [cel_llm] Calling OpenAI with model: {model}")
        resp = cli.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": prompt_sys},
                {"role": "user", "content": red},
            ],
            max_tokens=150,
        )
        
        # Extract the raw text from the response
        raw = None
        if isinstance(resp, dict):
            choices = resp.get("choices") or []
            if choices:
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
            print("⚠️ [cel_llm] OpenAI returned empty response")
            return None
            
        print(f"🔍 [cel_llm] Raw response: {repr(raw)}")
        
        # Clean the response (remove markdown if present)
        clean_raw = raw.strip()
        if clean_raw.startswith('```json'):
            clean_raw = clean_raw.replace('```json', '').replace('```', '').strip()
        elif clean_raw.startswith('```'):
            clean_raw = clean_raw.replace('```', '').strip()
            
        print(f"🔍 [cel_llm] Cleaned response: {repr(clean_raw)}")
        
        # Parse JSON
        try:
            data = json.loads(clean_raw)
        except json.JSONDecodeError as e:
            print(f"❌ [cel_llm] JSON decode error: {e}")
            print(f"❌ [cel_llm] Raw content was: {repr(clean_raw)}")
            return None
        
        label = data.get("label")
        conf = float(data.get("confidence", 0.0) or 0.0)
        
        if label not in _ALLOWED:
            print(f"⚠️ [cel_llm] Invalid label '{label}', expected one of: {_ALLOWED}")
            return None
            
        print(f"✅ [cel_llm] Success: {label} ({conf})")
        return {"label": label, "confidence": conf, "reason": data.get("reason")}
        
    except Exception as e:
        print(f"❌ [cel_llm] Exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return None