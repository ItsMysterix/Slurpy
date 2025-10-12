# backend/slurpy/domain/analytics/collectors.py
from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional, Tuple, Iterable
from datetime import datetime, timezone
import logging

# 🔧 moved: was ".supa"; now lives in adapters
from slurpy.adapters.supabase_client import supa

log = logging.getLogger("slurpy.analytics")

# ─────────────────────────────────────────────────────────────────────────────
# Table names (we’ll auto-detect which style exists on each call)
SNAKE_SESSION_TABLE = "chat_sessions"
SNAKE_MESSAGE_TABLE = "chat_messages"
LEGACY_SESSION_TABLE = "ChatSession"
LEGACY_MESSAGE_TABLE = "ChatMessage"

# Events & optional analysis blob tables
APP_EVENTS_TABLE = "app_events"
ANALYSIS_TABLE_CANDIDATES = ["Analysis", "SessionAnalysis", "ChatAnalysis", "analysis"]

# Regex helpers (some clients bubble these messages)
MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)
REL_MISSING_RE = re.compile(r"relation .* does not exist", re.IGNORECASE)

# Minimal payloads we know most schemas will accept
SNAKE_SESSION_MIN_KEYS = {"session_id", "user_id", "updated_at"}
SNAKE_MESSAGE_MIN_KEYS = {"session_id", "user_id", "role", "content", "created_at"}
SNAKE_EVENT_MIN_KEYS   = {"user_id", "event_type", "created_at"}

LEGACY_SESSION_MIN_KEYS = {"id", "sessionId", "userId", "updatedAt", "createdAt"}
LEGACY_MESSAGE_MIN_KEYS = {
    "id", "messageId", "session_id", "sessionId", "user_id", "userId",
    "role", "created_at", "createdAt",
    # include multiple synonyms so at least one survives
    "content", "text", "message", "body", "msg", "payload", "value", "contentText", "messageText",
}

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
    # Some clients use .execute(), others return results directly; prefer .execute()
    if hasattr(req, "execute"):
        return req.execute()
    return req

def _probe_table(name: str) -> bool:
    try:
        _tbl(name).select("*").limit(1).execute()
        return True
    except Exception:
        return False

def _use_snake() -> bool:
    """True if snake_case tables exist; we check both to be safe."""
    return _probe_table(SNAKE_SESSION_TABLE) and _probe_table(SNAKE_MESSAGE_TABLE)

def _missing_column_from_error(err: Exception) -> Optional[str]:
    m = MISSING_COL_RE.search(str(err))
    return m.group(1) if m else None

def _payload_keep(payload: Dict[str, Any], keys: Iterable[str]) -> Dict[str, Any]:
    return {k: v for k, v in payload.items() if k in keys}

def _strip_missing_and_retry(
    action: str,
    table: str,
    payload: Dict[str, Any],
    where: Optional[Dict[str, Any]] = None,
    on_conflict: Optional[str] = None,
) -> Optional[Any]:
    """
    Try a write; if API says a column is missing, strip it and retry until it lands.
    action ∈ {"insert","update","upsert"}.
    Returns response or None if nothing could be written.
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
            missing = _missing_column_from_error(e)
            if missing and missing in attempt:
                attempt.pop(missing, None)
                if not attempt:
                    return None
            else:
                # No "missing column" hint; give up here — caller can try a minimal payload path.
                raise

def _write_progressive(
    *,
    action: str,
    table: str,
    payload: Dict[str, Any],
    where: Optional[Dict[str, Any]] = None,
    on_conflict: Optional[str] = None,
    minimal_keys: Optional[Iterable[str]] = None,
) -> None:
    """
    Write with a cascade of fallbacks:
      1) Full payload via _strip_missing_and_retry (drops explicitly missing columns)
      2) Minimal payload (intersection with minimal_keys), if provided
      3) As last resort for UPDATE, try updating only the WHERE keys (no-op write) to avoid crashing
    Swallows errors (analytics is best-effort).
    """
    try:
        _strip_missing_and_retry(action, table, payload, where=where, on_conflict=on_conflict)
        return
    except Exception:
        pass

    if minimal_keys:
        try_payload = _payload_keep(payload, minimal_keys)
        if try_payload:
            try:
                _strip_missing_and_retry(action, table, try_payload, where=where, on_conflict=on_conflict)
                return
            except Exception:
                pass

    if action == "update" and where:
        try:
            meta_only = {}
            for k in ("updated_at", "updatedAt"):
                if k in payload:
                    meta_only[k] = payload[k]
            if meta_only:
                _strip_missing_and_retry("update", table, meta_only, where=where, on_conflict=on_conflict)
        except Exception:
            pass

# ─────────────────────────────────────────────────────────────────────────────
# Public API expected by rag/service
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
        payload = {
            "session_id": session_id,
            "user_id": user_id,
            "updated_at": now,
            # Optional / nice-to-have; will be stripped if missing
            "started_at": now,
            "message_count": 0,
            "last_emotion": None,
            "last_intensity": None,
        }
        _write_progressive(
            action="upsert",
            table=SNAKE_SESSION_TABLE,
            payload=payload,
            on_conflict="session_id",
            minimal_keys=SNAKE_SESSION_MIN_KEYS,
        )
    else:
        payload = {
            "id": session_id,
            "sessionId": session_id,
            "userId": user_id,
            "updatedAt": now,
            "createdAt": now,
            "messageCount": 0,
        }
        try:
            _write_progressive(
                action="upsert",
                table=LEGACY_SESSION_TABLE,
                payload=payload,
                on_conflict="id",
                minimal_keys=LEGACY_SESSION_MIN_KEYS,
            )
        except Exception:
            _write_progressive(
                action="upsert",
                table=LEGACY_SESSION_TABLE,
                payload=payload,
                minimal_keys=LEGACY_SESSION_MIN_KEYS,
            )

def add_msg(
    session_id: str,
    user_id: str,
    role: str,
    text: str,
    emotion: str,
    intensity: float,
    themes: List[str],
    context: Optional[Dict[str, Any]] = None,  # optional context blob
) -> None:
    """
    Insert a message and bump session counters.
    """
    now = _now_iso()

    if _use_snake():
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
        if context:
            msg_payload["context"] = context

        _write_progressive(
            action="insert",
            table=SNAKE_MESSAGE_TABLE,
            payload=msg_payload,
            minimal_keys=SNAKE_MESSAGE_MIN_KEYS,
        )

        # bump counters best-effort
        curr = 0
        try:
            resp = _tbl(SNAKE_SESSION_TABLE).select("message_count").eq("session_id", session_id).limit(1).execute()
            if getattr(resp, "data", None):
                row = resp.data[0] or {}
                if row.get("message_count") is not None:
                    curr = int(row["message_count"])
        except Exception:
            curr = 0

        sess_update = {
            "message_count": curr + 1,
            "last_emotion": emotion,
            "last_intensity": float(intensity),
            "updated_at": now,
            "last_activity": now,
        }
        _write_progressive(
            action="update",
            table=SNAKE_SESSION_TABLE,
            payload=sess_update,
            where={"session_id": session_id},
            minimal_keys=SNAKE_SESSION_MIN_KEYS,
        )
        return

    # legacy path
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
        # text synonyms to satisfy old NOT NULLs
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
    if context:
        msg_payload["context"] = context
        msg_payload["metadata"] = context
        msg_payload["meta"] = context

    _write_progressive(
        action="insert",
        table=LEGACY_MESSAGE_TABLE,
        payload=msg_payload,
        minimal_keys=LEGACY_MESSAGE_MIN_KEYS,
    )

    curr = 0
    try:
        resp = (
            _tbl(LEGACY_SESSION_TABLE)
            .select("message_count, messageCount")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
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
    _write_progressive(
        action="update",
        table=LEGACY_SESSION_TABLE,
        payload=sess_update,
        where={"id": session_id},
        minimal_keys=LEGACY_SESSION_MIN_KEYS,
    )

def set_session_fields(session_id: str, **fields: Any) -> None:
    """Update arbitrary fields on the session row."""
    if not fields:
        return
    now = _now_iso()
    payload = dict(fields)
    payload["updated_at"] = now
    payload["updatedAt"] = now

    if _use_snake():
        _write_progressive(
            action="update",
            table=SNAKE_SESSION_TABLE,
            payload=payload,
            where={"session_id": session_id},
            minimal_keys=SNAKE_SESSION_MIN_KEYS,
        )
    else:
        _write_progressive(
            action="update",
            table=LEGACY_SESSION_TABLE,
            payload=payload,
            where={"id": session_id},
            minimal_keys=LEGACY_SESSION_MIN_KEYS,
        )

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
# Optional dedicated “analysis blob” storage
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
            _write_progressive(action="upsert", table=table, payload=payload)
            return
        except Exception:
            continue
    try:
        _write_progressive(action="update", table=table, payload=base, where={"session_id": session_id})
    except Exception:
        pass

def get_analysis(session_id: str) -> Dict[str, Any]:
    table = _analysis_table()
    if table:
        row = _read_analysis_row_from_table(table, session_id)
        if isinstance(row, dict):
            return row
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
        _write_progressive(
            action="update",
            table=SNAKE_SESSION_TABLE,
            payload=payload,
            where={"session_id": session_id},
            minimal_keys=SNAKE_SESSION_MIN_KEYS,
        )
    else:
        _write_progressive(
            action="update",
            table=LEGACY_SESSION_TABLE,
            payload=payload,
            where={"id": session_id},
            minimal_keys=LEGACY_SESSION_MIN_KEYS,
        )

_update_analysis = update_analysis

# ─────────────────────────────────────────────────────────────────────────────
# Additions: session lifecycle, events, and convenience message insert

def ensure_session(
    user_id: str,
    session_id: Optional[str] = None,
    device: Optional[str] = None,
    version: Optional[str] = None,
) -> str:
    sid = session_id or str(uuid.uuid4())
    upsert_session(sid, user_id)
    now = _now_iso()
    set_session_fields(
        sid,
        device=device,
        version=version,
        last_activity=now,
        started_at=now,
    )
    return sid

def touch_session(session_id: str) -> None:
    now = _now_iso()
    set_session_fields(session_id, last_activity=now)

def close_session(session_id: str) -> None:
    now = _now_iso()
    set_session_fields(session_id, ended_at=now, last_activity=now)

def log_event(
    user_id: str,
    event_type: str,
    session_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    if not _probe_table(APP_EVENTS_TABLE):
        return
    payload = {
        "user_id": user_id,
        "session_id": session_id,
        "event_type": event_type,
        "meta": meta or {},
        "created_at": _now_iso(),
    }
    try:
        _write_progressive(
            action="insert",
            table=APP_EVENTS_TABLE,
            payload=payload,
            minimal_keys=SNAKE_EVENT_MIN_KEYS,
        )
    except Exception:
        pass

def insert_message(
    *,
    user_id: str,
    session_id: str,
    role: str,                 # 'user' | 'assistant' | 'system'
    content: str,
    emotion: Optional[str] = None,
    intensity: Optional[float] = None,
    themes: Optional[List[str]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    emo = (emotion or "neutral").strip()
    inten = float(intensity) if intensity is not None else 0.5
    th = themes or []

    add_msg(
        session_id=session_id,
        user_id=user_id,
        role=role,
        text=content,
        emotion=emo,
        intensity=inten,
        themes=th,
        context=context,
    )

    touch_session(session_id)
    log_event(user_id, "message_sent", session_id=session_id, meta={"role": role})
