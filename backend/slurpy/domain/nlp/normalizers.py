# backend/slurpy/domain/nlp/normalizers.py
# -*- coding: utf-8 -*-
"""
normalizers.py — small, dependency-light text normalization utilities

Goals
- Keep it pure stdlib (regex/unicodedata) for speed & portability
- Make each step composable; provide one-shot 'normalize_text' that uses them

Public API
----------
normalize_text(text, *, lower=True, strip_emoji=True, mask_pii=False, keep_urls=False)
basic_clean(text)
collapse_ws(text)
strip_controls(text)
strip_emoji(text)
mask_emails(text)
mask_phones(text)
mask_urls(text)
slugify(text, *, keep=".-_")
fingerprint(text, *, keep_ascii=True)
split_sentences(text)
safe_truncate(text, max_chars, ellipsis="…")
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, List

# ---------- regexes (compiled once) ----------

RE_WS_MULTI = re.compile(r"\s+", re.UNICODE)
RE_CTRL = re.compile(r"[\u0000-\u001F\u007F-\u009F]")
RE_EMOJI = re.compile(
    "["                       # basic emoji blocks + modifiers
    "\U0001F1E6-\U0001F1FF"   # flags
    "\U0001F300-\U0001F5FF"   # symbols & pictographs
    "\U0001F600-\U0001F64F"   # emoticons
    "\U0001F680-\U0001F6FF"   # transport & map
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\U00002702-\U000027B0"   # dingbats
    "\U000024C2-\U0001F251"
    "]",
    re.UNICODE,
)

RE_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
RE_PHONE = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3}[-.\s]?\d{3,4}\b")
RE_URL = re.compile(r"\bhttps?://[^\s<>\"']+\b", re.I)

RE_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")

# ---------- core steps ----------

def basic_clean(text: str) -> str:
    """
    NFKC normalize + strip control chars.
    """
    if text is None:
        return ""
    t = unicodedata.normalize("NFKC", str(text))
    t = RE_CTRL.sub("", t)
    return t

def collapse_ws(text: str) -> str:
    """
    Collapse all whitespace runs to a single space and trim ends.
    """
    return RE_WS_MULTI.sub(" ", text).strip()

def strip_controls(text: str) -> str:
    return RE_CTRL.sub("", text)

def strip_emoji(text: str) -> str:
    return RE_EMOJI.sub("", text)

def mask_emails(text: str, replacement: str = "[email]") -> str:
    return RE_EMAIL.sub(replacement, text)

def mask_phones(text: str, replacement: str = "[phone]") -> str:
    return RE_PHONE.sub(replacement, text)

def mask_urls(text: str, replacement: str = "[link]") -> str:
    return RE_URL.sub(replacement, text)

def slugify(text: str, *, keep: str = ".-_") -> str:
    """
    Lowercase ASCII slug. Removes accents and any char not alnum or in `keep`.
    """
    if not text:
        return ""
    t = unicodedata.normalize("NFKD", str(text))
    t = "".join(c for c in t if not unicodedata.combining(c))  # strip accents
    t = t.lower()
    out = []
    for ch in t:
        if ch.isalnum() or ch in keep:
            out.append(ch)
        else:
            out.append(" ")
    return collapse_ws("".join(out)).replace(" ", "-")

def fingerprint(text: str, *, keep_ascii: bool = True) -> str:
    """
    Order/spacing-insensitive hashable 'fingerprint' for dedupe.
    - Unicode NFKC
    - Lowercase
    - Remove punctuation/emoji/controls
    - Sort unique tokens
    """
    t = basic_clean(text).lower()
    t = strip_emoji(t)
    # keep letters/digits/space only
    t = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in t)
    toks = collapse_ws(t).split()
    if keep_ascii:
        toks = ["".join(c for c in tok if ord(c) < 128) for tok in toks]
        toks = [tok for tok in toks if tok]
    toks = sorted(set(toks))
    return " ".join(toks)

def split_sentences(text: str) -> List[str]:
    """
    Very lightweight sentence splitter (no heavy NLP dep).
    """
    if not text:
        return []
    parts = RE_SENT_SPLIT.split(collapse_ws(text))
    return [p.strip() for p in parts if p.strip()]

def safe_truncate(text: str, max_chars: int, ellipsis: str = "…") -> str:
    """
    Truncate at a word boundary <= max_chars. Adds ellipsis only if truncated.
    """
    t = text or ""
    if len(t) <= max_chars:
        return t
    cut = t[:max_chars].rsplit(" ", 1)[0]
    return (cut or t[:max_chars]).rstrip() + ellipsis

# ---------- one-shot orchestrator ----------

def normalize_text(
    text: str,
    *,
    lower: bool = True,
    strip_emoji: bool = True,   # noqa: F811  (intentional param name overlap)
    mask_pii: bool = False,
    keep_urls: bool = False,
) -> str:
    """
    Opinionated normalization for storage/search.
    - Unicode normalize, strip controls
    - Optional emoji strip
    - Optional PII masks (email/phone and URLs unless keep_urls=True)
    - Collapse whitespace, optional lowercase
    """
    t = basic_clean(text)
    if strip_emoji:
        t = RE_EMOJI.sub("", t)
    if mask_pii:
        t = mask_emails(t)
        t = mask_phones(t)
        if not keep_urls:
            t = mask_urls(t)
    t = collapse_ws(t)
    if lower:
        t = t.lower()
    return t

# ---------- small helpers ----------

def normalize_many(items: Iterable[str], **kwargs) -> List[str]:
    return [normalize_text(x, **kwargs) for x in items]

__all__ = [
    "normalize_text",
    "normalize_many",
    "basic_clean",
    "collapse_ws",
    "strip_controls",
    "strip_emoji",
    "mask_emails",
    "mask_phones",
    "mask_urls",
    "slugify",
    "fingerprint",
    "split_sentences",
    "safe_truncate",
]
