# backend/ufm.py
from __future__ import annotations

from typing import Any, Dict, Optional, List
from datetime import datetime, timezone
import re

from .supa import supa  # NOTE: this is a function in your project

# Candidate table names (we'll probe these at runtime)
_UFM_TABLE_CANDIDATES = ["UFM", "UserFeelingMap", "user_feeling_map", "UserFeeling", "UserState"]

# PostgREST error pattern for missing columns
_MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)

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

def _probe_table(name: str) -> bool:
    client = _db()
    try:
        # cheap probe; different SDKs all allow select(...).limit(1).execute()
        _tbl(client, name).select("*").limit(1).execute()
        return True
    except Exception:
        return False

def _ufm_table_name() -> Optional[str]:
    for t in _UFM_TABLE_CANDIDATES:
        if _probe_table(t):
            return t
    return None

def _exec(req):
    return req.execute()

def _strip_missing_and_retry(action: str, table: str, payload: Dict[str, Any], where: Optional[Dict[str, Any]] = None):
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

# -------------------- Public API --------------------

def get(user_id: str) -> Dict[str, Any]:
    """
    Return the current UFM row for the user, or {} if not found / table unknown / request failed.
    Never raises on None responses.
    """
    table = _ufm_table_name()
    if not table:
        return {}

    client = _db()
    try:
        resp = _tbl(client, table).select("*").eq("user_id", user_id).limit(1).execute()
    except Exception:
        # try camelCase key as fallback selector
        try:
            resp = _tbl(client, table).select("*").eq("userId", user_id).limit(1).execute()
        except Exception:
            return {}

    data = getattr(resp, "data", None)
    if not data:
        return {}

    row = data[0] or {}
    if not isinstance(row, dict):
        return {}
    return row

def update(user_id: str, last_message: str, emotion: str, themes: List[str]) -> None:
    """
    Upsert a user's feeling/state snapshot. Sends both snake_case and camelCase keys.
    Unknown columns are stripped automatically.
    """
    table = _ufm_table_name()
    if not table:
        # No table available → nothing to do, but don't crash caller
        return

    # fetch current (safe)
    cur = get(user_id) or {}
    # we keep it simple; if you later want counters, you can add them here
    payload = {
        # canonical
        "user_id": user_id,
        "last_message_text": last_message,
        "last_emotion": emotion,
        "themes": themes,
        "updated_at": _now_iso(),
        # legacy
        "userId": user_id,
        "lastMessageText": last_message,
        "lastEmotion": emotion,
        "updatedAt": _now_iso(),
    }

    try:
        _strip_missing_and_retry("upsert", table, payload)
    except Exception:
        # Fallback: try insert first, then update
        try:
            _strip_missing_and_retry("insert", table, payload)
        except Exception:
            try:
                _strip_missing_and_retry("update", table, payload, where={"user_id": user_id})
            except Exception:
                # Last-ditch: update by camelCase key
                _strip_missing_and_retry("update", table, payload, where={"userId": user_id})
