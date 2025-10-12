from __future__ import annotations

import re
from typing import Iterable, List

__all__ = [
    "to_bool",
    "clip",
    "truncate",
    "squash_ws",
    "strip_control",
    "slugify",
    "unique_preserve",
]

_TRUE = {"1", "true", "yes", "y", "on"}
_FALSE = {"0", "false", "no", "n", "off"}

_CTRL_RE = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f]")
_WS_RE = re.compile(r"\s+")

def to_bool(s: object, default: bool = False) -> bool:
    """Parse common truthy/falsey strings."""
    if isinstance(s, bool):
        return s
    if s is None:
        return default
    v = str(s).strip().lower()
    if v in _TRUE:
        return True
    if v in _FALSE:
        return False
    return default

def clip(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    try:
        f = float(x)
    except Exception:
        return lo
    return max(lo, min(hi, f))

def truncate(text: str, max_len: int, ellipsis: str = "…") -> str:
    if not text or max_len <= 0:
        return ""
    if len(text) <= max_len:
        return text
    cut = max_len - len(ellipsis)
    return (text[:cut].rsplit(" ", 1)[0] if cut > 4 else text[:cut]) + ellipsis

def squash_ws(s: str) -> str:
    """Collapse whitespace to single spaces; trim ends."""
    return _WS_RE.sub(" ", (s or "")).strip()

def strip_control(s: str) -> str:
    """Remove non-printing control chars (keeps tabs/newlines)."""
    return _CTRL_RE.sub("", s or "")

def slugify(s: str, sep: str = "-") -> str:
    """Lowercase, alnum + sep."""
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", sep, s).strip(sep)
    s = re.sub(fr"{re.escape(sep)}+", sep, s)
    return s

def unique_preserve(items: Iterable[str]) -> List[str]:
    """Deduplicate while preserving order."""
    seen = set()
    out: List[str] = []
    for it in items or []:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out
