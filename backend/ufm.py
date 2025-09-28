# -*- coding: utf-8 -*-
"""
ufm.py — User Feeling Map snapshot (prod-safe)

Public API (unchanged)
----------------------
get(user_id: str) -> Dict[str, Any]
update(user_id: str, last_message: str, emotion: str, themes: List[str]) -> None

Notes
-----
- Probes candidate table names once and caches the winner.
- Sends both snake_case and camelCase columns; unknowns are stripped and retried.
- Hardens inputs (message length, themes normalization) to keep rows lean and predictable.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, List, Iterable
from datetime import datetime, timezone
import re

from .supa import supa  # function that returns a Supabase client

# Candidate table names (we'll probe these at runtime)
_UFM_TABLE_CANDIDATES = ["UFM", "UserFeelingMap", "user_feeling_map", "UserFeeling", "UserState"]

# PostgREST error pattern for missing columns
_MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)

# Cached table name once detected
_TABLE_CACHE: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Utilities
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _db():
    return supa() if callable(supa) else supa

def _tbl(client, name: str):
    if hasattr(client, "table"):
        return client.table(name)
    if hasattr(client, "from_"):
        return client.from_(name)
    raise RuntimeError("Supabase/PostgREST client has neither .table nor .from_")

def _exec(req):
    return req.execute()

def _probe_table(name: str) -> bool:
    client = _db()
    try:
        _tbl(client, name).select("*").limit(1).execute()
        return True
    except Exception:
        return False

def _ufm_table_name() -> Optional[str]:
    """Detect & cache the first available table name."""
    global _TABLE_CACHE
    if _TABLE_CACHE:
        return _TABLE_CACHE
    for t in _UFM_TABLE_CANDIDATES:
        if _probe_table(t):
            _TABLE_CACHE = t
            return t
    return None

def _strip_missing_and_retry(
    action: str,
    table: str,
    payload: Dict[str, Any],
    where: Optional[Dict[str, Any]] = None,
):
    """
    Write helper that strips unknown columns based on PostgREST errors and retries.
    action: "upsert" | "insert" | "update"
    """
    client = _db()
    attempt = dict(payload)
    while True:
        try:
            t = _tbl(client, table)
            if action == "upsert":
                # Keep generic upsert for broad SDK compatibility
                req = t.upsert(attempt)
            elif action == "insert":
                req = t.insert(attempt)
            elif action == "update":
                req = t.update(attempt)
                if where:
                    for k, v in where.items():
                        req = req.eq(k, v)
            else:
                raise ValueError(f"unsupported action {action}")
            return _exec(req)
        except Exception as e:
            m = _MISSING_COL_RE.search(str(e))
            if not m:
                # not a "missing column" issue → bubble up
                raise
            missing = m.group(1)
            if missing in attempt:
                attempt.pop(missing, None)
                if not attempt:
                    return None
            else:
                # server complained about a column we didn't send → bubble up
                raise

# ─────────────────────────────────────────────────────────────────────────────
# Input hardening
_MAX_MSG_LEN = 2000
_MAX_THEMES = 12
_MAX_THEME_LEN = 48

def _clean_text(s: str) -> str:
    if not isinstance(s, str):
        return ""
    s = s.replace("\x00", " ").strip()
    if len(s) > _MAX_MSG_LEN:
        s = s[:_MAX_MSG_LEN]
    return s

def _as_list(x: Any) -> List[Any]:
    if x is None:
        return []
    if isinstance(x, list):
        return x
    if isinstance(x, (tuple, set)):
        return list(x)
    return [x]

def _clean_themes(themes: Iterable[Any]) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in themes:
        t = str(raw).strip().lower()
        if not t:
            continue
        if len(t) > _MAX_THEME_LEN:
            t = t[:_MAX_THEME_LEN]
        if t not in seen:
            seen.add(t)
            out.append(t)
        if len(out) >= _MAX_THEMES:
            break
    return out

# ─────────────────────────────────────────────────────────────────────────────
# Public API

def get(user_id: str) -> Dict[str, Any]:
    """
    Return the current UFM row for the user, or {} if not found / table unknown / request failed.
    Never raises on None responses.
    """
    table = _ufm_table_name()
    if not table:
        return {}

    client = _db()
    # Try snake_case key first, then camelCase fallback
    try:
        resp = _tbl(client, table).select("*").eq("user_id", user_id).limit(1).execute()
    except Exception:
        try:
            resp = _tbl(client, table).select("*").eq("userId", user_id).limit(1).execute()
        except Exception:
            return {}

    data = getattr(resp, "data", None)
    if not data:
        return {}
    row = data[0] or {}
    return row if isinstance(row, dict) else {}

def update(user_id: str, last_message: str, emotion: str, themes: List[str]) -> None:
    """
    Upsert a user's feeling/state snapshot. Sends both snake_case and camelCase keys.
    Unknown columns are stripped automatically. No exceptions on common schema drift.
    """
    table = _ufm_table_name()
    if not table:
        # No table available → nothing to do, but don't crash caller
        return

    msg = _clean_text(last_message or "")
    emo = (emotion or "neutral").strip().lower()[:24]
    th  = _clean_themes(_as_list(themes))

    payload = {
        # canonical (snake_case)
        "user_id": user_id,
        "last_message_text": msg,
        "last_emotion": emo,
        "themes": th,
        "updated_at": _now_iso(),
        # legacy (camelCase)
        "userId": user_id,
        "lastMessageText": msg,
        "lastEmotion": emo,
        "updatedAt": _now_iso(),
    }

    # Try upsert; on SDKs without proper UPSERT semantics, fall back to insert/update dance.
    try:
        _strip_missing_and_retry("upsert", table, payload)
        return
    except Exception:
        pass

    try:
        _strip_missing_and_retry("insert", table, payload)
        return
    except Exception:
        pass

    # Last-ditch: update by snake, then camel
    try:
        _strip_missing_and_retry("update", table, payload, where={"user_id": user_id})
        return
    except Exception:
        try:
            _strip_missing_and_retry("update", table, payload, where={"userId": user_id})
        except Exception:
            # swallow: UFM is best-effort; core chat should not fail because of snapshot writes
            return


__all__ = ["get", "update"]
