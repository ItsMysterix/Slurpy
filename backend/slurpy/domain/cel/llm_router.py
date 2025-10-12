from __future__ import annotations
import os, re, json
from typing import Optional, Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from openai import OpenAI
else:
    try:
        from openai import OpenAI  # OpenAI>=1.x
    except Exception:
        OpenAI = None  # type: ignore

_ALLOWED = ["anxious", "angry", "sad", "foggy", "meaning", "neutral"]
TOOL_HINT = {"anxious": "Breathing", "angry": "ConflictStyle", "sad": "Stretch"}

def _redact(text: str) -> str:
    t = re.sub(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", "[email]", text or "")
    t = re.sub(r"\b\+?\d[\d\-\s]{7,}\b", "[phone]", t)
    return t[:512]

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
    return t in {"hi", "hey", "hello", "yo", "sup", "hiya"} or (len(t) <= 3 and t in {"hi", "yo"})

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
    if len(t.split()) <= 2:
        return "neutral"
    return None

def _extract_content(resp: Any) -> Optional[str]:
    if resp is None:
        return None
    try:
        choices = getattr(resp, "choices", None)
        if choices:
            first = choices[0]
            msg = getattr(first, "message", None)
            if msg is not None and getattr(msg, "content", None):
                return str(msg.content)
            if hasattr(first, "text") and first.text:
                return str(first.text)
        if isinstance(resp, dict):
            ch = resp.get("choices") or []
            if ch:
                msg = ch[0].get("message") or {}
                return msg.get("content") or ch[0].get("text")
    except Exception:
        pass
    return None

def llm_semantic_emotion(text: str) -> Optional[Dict[str, Any]]:
    h = _heuristic_label(text)
    if h in _ALLOWED:
        return {"label": h, "confidence": 0.55, "reason": "heuristic"}

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

    # Some SDK versions before response_format existed; fall back gracefully.
    kwargs = dict(
        model=model,
        temperature=0,
        max_tokens=120,
        messages=[{"role": "system", "content": system_prompt},
                  {"role": "user", "content": red}],
    )
    try:
        kwargs["response_format"] = {"type": "json_object"}  # type: ignore[assignment]
    except Exception:
        pass

    try:
        resp = cli.chat.completions.create(**kwargs)  # type: ignore[arg-type]
        raw = _extract_content(resp)
        if not raw:
            print("⚠️ [cel_llm] Empty content")
            return None

        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.strip("`").strip()
            if clean.lower().startswith("json"):
                clean = clean[4:].strip()

        data = json.loads(clean)
        label = str(data.get("label", "")).strip().lower()
        conf = float(data.get("confidence", 0.0) or 0.0)
        if label not in _ALLOWED:
            print(f"⚠️ [cel_llm] Invalid label '{label}'")
            return None
        conf = max(0.0, min(1.0, conf))
        out: Dict[str, Any] = {"label": label, "confidence": conf}
        if data.get("reason"):
            out["reason"] = str(data["reason"])[:200]
        return out
    except Exception as e:
        print(f"❌ [cel_llm] Exception: {type(e).__name__}: {e}")
        return None
