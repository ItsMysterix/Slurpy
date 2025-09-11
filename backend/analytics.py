# backend/analytics.py
from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from .supa import supa  # function returning the client

# ─────────────────────────────────────────────────────────────────────────────
# Table names (we’ll auto-detect which style exists on each call)
SNAKE_SESSION_TABLE = "chat_sessions"
SNAKE_MESSAGE_TABLE = "chat_messages"
LEGACY_SESSION_TABLE = "ChatSession"
LEGACY_MESSAGE_TABLE = "ChatMessage"

# Candidates for a dedicated analysis-blob table (NOT your 'analytics' aggregates)
ANALYSIS_TABLE_CANDIDATES = ["Analysis", "SessionAnalysis", "ChatAnalysis", "analysis"]

# Regex helpers
MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)
REL_MISSING_RE = re.compile(r"relation .* does not exist", re.IGNORECASE)

# ─────────────────────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _db():
    return supa() if callable(supa) else supa

def _tbl(name: str):
    client = _db()
    if hasattr(client, "table"):
        return client.table(name)
    if hasattr(client, "from_"):
        return client.from_(name)
    raise RuntimeError("Supabase/PostgREST client has neither .table nor .from_")

def _exec(req):
    return req.execute()

def _probe_table(name: str) -> bool:
    try:
        _tbl(name).select("*").limit(1).execute()
        return True
    except Exception:
        return False

def _use_snake() -> bool:
    """True if snake_case tables exist; we check both to be safe."""
    return _probe_table(SNAKE_SESSION_TABLE) and _probe_table(SNAKE_MESSAGE_TABLE)

def _strip_missing_and_retry(
    action: str,
    table: str,
    payload: Dict[str, Any],
    where: Optional[Dict[str, Any]] = None,
    on_conflict: Optional[str] = None,
):
    """
    Try a write; if API says a column is missing, strip it and retry until it lands.
    action ∈ {"insert","update","upsert"}.
    """
    attempt = dict(payload)
    while True:
        try:
            t = _tbl(table)
            if action == "insert":
                req = t.insert(attempt)
            elif action == "update":
                req = t.update(attempt)
                if where:
                    for k, v in where.items():
                        req = req.eq(k, v)
            elif action == "upsert":
                req = t.upsert(attempt, on_conflict=on_conflict) if on_conflict else t.upsert(attempt)
            else:
                raise ValueError(f"Unsupported action: {action}")
            return _exec(req)
        except Exception as e:
            s = str(e)
            # If the table itself doesn't exist, bubble up (caller will fall back)
            if REL_MISSING_RE.search(s):
                raise
            m = MISSING_COL_RE.search(s)
            if not m:
                raise
            missing = m.group(1)
            if missing in attempt:
                attempt.pop(missing, None)
                if not attempt:
                    return None
            else:
                raise

# ─────────────────────────────────────────────────────────────────────────────
# Public API expected by rag_core
def init() -> None:
    """Compatibility no-op."""
    return None

def upsert_session(session_id: str, user_id: str) -> None:
    """
    Create/update a session snapshot row.
    Snake_case → chat_sessions(session_id,user_id,started_at,updated_at,...)
    Legacy     → ChatSession(id,userId,sessionId,updatedAt,...)
    """
    now = _now_iso()
    if _use_snake():
        # Prefer upsert on session_id; if constraint missing, emulate.
        payload = {
            "session_id": session_id,
            "user_id": user_id,
            "updated_at": now,
            # created_at/started_at: if it’s a new row, DB defaults may fill;
            # including started_at is harmless if it exists.
            "started_at": now,
            "message_count": 0,   # harmless if exists; stripped if not
            "last_emotion": None, # harmless; stripped if not
            "last_intensity": None,
        }
        try:
            _strip_missing_and_retry(
                "upsert",
                SNAKE_SESSION_TABLE,
                payload,
                on_conflict="session_id",
            )
        except Exception:
            # Fallback: try update first; if 0 rows, insert.
            try:
                _strip_missing_and_retry(
                    "update",
                    SNAKE_SESSION_TABLE,
                    {"updated_at": now},
                    where={"session_id": session_id},
                )
            except Exception:
                pass
            try:
                _strip_missing_and_retry("insert", SNAKE_SESSION_TABLE, payload)
            except Exception:
                # If both fail, give up silently (rag_core wraps this call)
                pass
    else:
        # Legacy camelCase
        payload = {
            "id": session_id,
            "sessionId": session_id,
            "userId": user_id,
            "updatedAt": now,
            "createdAt": now,
            "messageCount": 0,
        }
        try:
            _strip_missing_and_retry("upsert", LEGACY_SESSION_TABLE, payload, on_conflict="id")
        except Exception:
            try:
                _strip_missing_and_retry("upsert", LEGACY_SESSION_TABLE, payload)
            except Exception:
                # update then insert fallback
                try:
                    _strip_missing_and_retry("update", LEGACY_SESSION_TABLE, {"updatedAt": now}, where={"id": session_id})
                except Exception:
                    pass
                try:
                    _strip_missing_and_retry("insert", LEGACY_SESSION_TABLE, payload)
                except Exception:
                    pass

def add_msg(
    session_id: str,
    user_id: str,
    role: str,
    text: str,
    emotion: str,
    intensity: float,
    themes: List[str],
) -> None:
    """
    Insert a message and bump session counters.
    Snake_case → chat_messages (omit id: bigint auto), content NOT NULL.
    Legacy     → ChatMessage with lots of synonyms to satisfy old NOT NULLs.
    """
    now = _now_iso()

    if _use_snake():
        # 1) Insert message (no id → let DB auto-generate bigint)
        msg_payload = {
            "session_id": session_id,
            "user_id": user_id,
            "role": role,
            "content": text,
            "emotion": emotion,
            "intensity": float(intensity),
            "themes": themes,
            "created_at": now,
        }
        try:
            _strip_missing_and_retry("insert", SNAKE_MESSAGE_TABLE, msg_payload)
        except Exception:
            # swallow; rag_core treats analytics best-effort
            return

        # 2) Read current message_count
        curr = 0
        try:
            resp = _tbl(SNAKE_SESSION_TABLE).select("message_count").eq("session_id", session_id).limit(1).execute()
            if getattr(resp, "data", None):
                row = resp.data[0] or {}
                if row.get("message_count") is not None:
                    curr = int(row["message_count"])
        except Exception:
            curr = 0

        # 3) Update snapshot
        sess_update = {
            "message_count": curr + 1,
            "last_emotion": emotion,
            "last_intensity": float(intensity),
            "updated_at": now,
        }
        try:
            _strip_missing_and_retry("update", SNAKE_SESSION_TABLE, sess_update, where={"session_id": session_id})
        except Exception:
            pass
        return

    # Legacy path
    msg_id = str(uuid.uuid4())
    msg_payload = {
        "id": msg_id,
        "messageId": msg_id,
        "session_id": session_id,
        "sessionId": session_id,
        "user_id": user_id,
        "userId": user_id,
        "role": role,
        "emotion": emotion,
        "intensity": float(intensity),
        "created_at": now,
        "createdAt": now,
        "themes": themes,
        # TEXT synonyms (some old schemas require certain ones NOT NULL)
        "content": text,
        "text": text,
        "message": text,
        "body": text,
        "msg": text,
        "payload": text,
        "value": text,
        "contentText": text,
        "messageText": text,
    }
    try:
        _strip_missing_and_retry("insert", LEGACY_MESSAGE_TABLE, msg_payload)
    except Exception:
        return

    curr = 0
    try:
        resp = _tbl(LEGACY_SESSION_TABLE).select("message_count, messageCount").eq("id", session_id).limit(1).execute()
        if getattr(resp, "data", None):
            row = resp.data[0] or {}
            if row.get("message_count") is not None:
                curr = int(row["message_count"])
            elif row.get("messageCount") is not None:
                curr = int(row["messageCount"])
    except Exception:
        curr = 0

    sess_update = {
        "message_count": curr + 1,
        "last_emotion": emotion,
        "last_intensity": float(intensity),
        "updated_at": now,
        "messageCount": curr + 1,
        "lastEmotion": emotion,
        "lastIntensity": float(intensity),
        "updatedAt": now,
    }
    try:
        _strip_missing_and_retry("update", LEGACY_SESSION_TABLE, sess_update, where={"id": session_id})
    except Exception:
        pass

def set_session_fields(session_id: str, **fields: Any) -> None:
    """Update arbitrary fields on the session row."""
    if not fields:
        return
    now = _now_iso()
    payload = dict(fields)
    payload["updated_at"] = now
    payload["updatedAt"] = now

    if _use_snake():
        try:
            _strip_missing_and_retry("update", SNAKE_SESSION_TABLE, payload, where={"session_id": session_id})
        except Exception:
            pass
    else:
        try:
            _strip_missing_and_retry("update", LEGACY_SESSION_TABLE, payload, where={"id": session_id})
        except Exception:
            pass

def get_session(session_id: str) -> Dict[str, Any]:
    """Fetch a session row ({} if absent)."""
    try:
        if _use_snake():
            resp = _tbl(SNAKE_SESSION_TABLE).select("*").eq("session_id", session_id).limit(1).execute()
        else:
            resp = _tbl(LEGACY_SESSION_TABLE).select("*").eq("id", session_id).limit(1).execute()
    except Exception:
        return {}
    data = getattr(resp, "data", None)
    if not data:
        return {}
    row = data[0] or {}
    return row if isinstance(row, dict) else {}

# ─────────────────────────────────────────────────────────────────────────────
# Optional dedicated “analysis blob” storage (not your 'analytics' aggregates)
def _analysis_table() -> Optional[str]:
    for t in ANALYSIS_TABLE_CANDIDATES:
        if _probe_table(t):
            return t
    return None

def _read_analysis_row_from_table(table: str, session_id: str) -> Optional[Dict[str, Any]]:
    for key in ("session_id", "sessionId", "id"):
        try:
            resp = _tbl(table).select("*").eq(key, session_id).limit(1).execute()
            data = getattr(resp, "data", None)
            if data:
                row = data[0] or {}
                if not isinstance(row, dict):
                    continue
                for col in ("analysis", "data", "blob", "payload"):
                    if isinstance(row.get(col), dict):
                        return row[col]
                return row
        except Exception:
            continue
    return None

def _write_analysis_row_to_table(table: str, session_id: str, analysis: Dict[str, Any]) -> None:
    base = {"analysis": analysis, "updated_at": _now_iso(), "updatedAt": _now_iso()}
    shapes = [
        {"session_id": session_id, **base},
        {"sessionId": session_id, **base},
        {"id": session_id, **base},
    ]
    for payload in shapes:
        try:
            _strip_missing_and_retry("upsert", table, payload)
            return
        except Exception:
            continue
    _strip_missing_and_retry("update", table, base, where={"session_id": session_id})

def get_analysis(session_id: str) -> Dict[str, Any]:
    table = _analysis_table()
    if table:
        row = _read_analysis_row_from_table(table, session_id)
        if isinstance(row, dict):
            return row
    # Fallback to a JSONB column on the session row, if present
    sess = get_session(session_id)
    if not sess:
        return {}
    analysis = sess.get("analysis")
    if isinstance(analysis, dict):
        return analysis
    out: Dict[str, Any] = {}
    for k in ("report", "report_history", "roleplay", "summary"):
        if k in sess:
            out[k] = sess[k]
    for k in ("Report", "ReportHistory", "Roleplay", "Summary"):
        if k in sess and k.lower() not in out:
            out[k.lower()] = sess[k]
    return out or {}

# Back-compat aliases (some older callers might import these)
_get_analysis = get_analysis
def update_analysis(session_id: str, analysis: Dict[str, Any]) -> None:
    table = _analysis_table()
    if table:
        try:
            _write_analysis_row_to_table(table, session_id, analysis)
            return
        except Exception:
            pass
    payload = {"analysis": analysis, "updated_at": _now_iso(), "updatedAt": _now_iso()}
    if _use_snake():
        _strip_missing_and_retry("update", SNAKE_SESSION_TABLE, payload, where={"session_id": session_id})
    else:
        _strip_missing_and_retry("update", LEGACY_SESSION_TABLE, payload, where={"id": session_id})

_update_analysis = update_analysis
