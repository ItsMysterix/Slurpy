# backend/analytics.py
from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from .supa import supa  # NOTE: in your project this is a function returning the client

# ---------- Configuration ----------
SESSION_TABLE = "ChatSession"
MESSAGE_TABLE = "ChatMessage"
# We'll auto-detect an analysis table if one exists:
ANALYSIS_TABLE_CANDIDATES = ["Analysis", "SessionAnalysis", "ChatAnalysis", "analysis"]

# ---------- Regex for PostgREST "missing column" ----------
MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)

# ---------- Time helpers ----------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ---------- Client helpers ----------
def _db():
    """Return a usable Supabase/PostgREST client."""
    return supa() if callable(supa) else supa

def _tbl(name: str):
    """Return a table ref compatible with both .table() and .from_() clients."""
    client = _db()
    if hasattr(client, "table"):
        return client.table(name)
    if hasattr(client, "from_"):
        return client.from_(name)
    raise RuntimeError("Supabase/PostgREST client has neither .table nor .from_")

def _exec(req):
    """Execute a PostgREST request (sync)."""
    return req.execute()

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
                if on_conflict:
                    req = t.upsert(attempt, on_conflict=on_conflict)
                else:
                    req = t.upsert(attempt)
            else:
                raise ValueError(f"Unsupported action: {action}")
            return _exec(req)
        except Exception as e:
            m = MISSING_COL_RE.search(str(e))
            if not m:
                # Not a "missing column" error → bubble up
                raise
            missing = m.group(1)
            if missing in attempt:
                attempt.pop(missing, None)
                if not attempt:
                    return None
            else:
                # Server complained about a column we didn't send (e.g., filter) → bubble up
                raise

# ---------- Discovery ----------
def _probe_table(name: str) -> bool:
    try:
        _tbl(name).select("*").limit(1).execute()
        return True
    except Exception:
        return False

def _analysis_table() -> Optional[str]:
    for t in ANALYSIS_TABLE_CANDIDATES:
        if _probe_table(t):
            return t
    return None

# ---------- Public API ----------
def init() -> None:
    """Compatibility no-op; keep for callers that import init_db()."""
    return None

def upsert_session(session_id: str, user_id: str) -> None:
    """
    Create/update a session row.
    Sends both snake_case and camelCase keys to satisfy legacy schemas.
    Unknown columns get stripped automatically.
    """
    payload = {
        # canonical
        "id": session_id,
        "user_id": user_id,
        "updated_at": _now_iso(),
        # legacy/camel (in case NOT NULL constraints exist on these)
        "sessionId": session_id,
        "userId": user_id,
        "updatedAt": _now_iso(),
        "createdAt": _now_iso(),
        "messageCount": 0,  # harmless if exists; stripped if not
    }
    # Prefer on_conflict="id" if the API supports it
    try:
        _strip_missing_and_retry("upsert", SESSION_TABLE, payload, on_conflict="id")
    except Exception:
        _strip_missing_and_retry("upsert", SESSION_TABLE, payload)

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
    Insert a message into ChatMessage and bump ChatSession counters.
    Mirrors message text into multiple possible columns (content/text/message/body/msg/payload/value/*Text)
    so NOT NULL constraints on legacy schemas don't explode.
    """
    msg_id = str(uuid.uuid4())
    now = _now_iso()

    # 1) Insert the message
    msg_payload = {
        # primary key (both styles)
        "id": msg_id,
        "messageId": msg_id,

        # linkage (both styles)
        "session_id": session_id,
        "sessionId": session_id,
        "user_id": user_id,
        "userId": user_id,

        # role & emotion
        "role": role,
        "emotion": emotion,
        "intensity": float(intensity),

        # timestamps (both styles)
        "created_at": now,
        "createdAt": now,

        # themes (strip if column missing)
        "themes": themes,

        # ---- TEXT FIELD SYNONYMS ----
        "content": text,        # many schemas enforce NOT NULL here
        "text": text,
        "message": text,
        "body": text,
        "msg": text,
        "payload": text,
        "value": text,
        "contentText": text,
        "messageText": text,
    }
    _strip_missing_and_retry("insert", MESSAGE_TABLE, msg_payload)

    # 2) Read current message count (support both columns)
    curr_count = 0
    try:
        resp = _tbl(SESSION_TABLE).select("message_count, messageCount").eq("id", session_id).limit(1).execute()
        if getattr(resp, "data", None):
            row = resp.data[0] or {}
            if row.get("message_count") is not None:
                curr_count = int(row["message_count"])
            elif row.get("messageCount") is not None:
                curr_count = int(row["messageCount"])
    except Exception:
        curr_count = 0

    # 3) Update session snapshot/counters (both styles)
    sess_update = {
        # canonical
        "message_count": curr_count + 1,
        "last_emotion": emotion,
        "last_intensity": float(intensity),
        "updated_at": now,
        # legacy
        "messageCount": curr_count + 1,
        "lastEmotion": emotion,
        "lastIntensity": float(intensity),
        "updatedAt": now,
    }
    _strip_missing_and_retry("update", SESSION_TABLE, sess_update, where={"id": session_id})

def set_session_fields(session_id: str, **fields: Any) -> None:
    """
    Update arbitrary fields on ChatSession (snake_case preferred).
    Unknown columns will be stripped and retried automatically.
    """
    if not fields:
        return
    payload = dict(fields)
    now = _now_iso()
    payload["updated_at"] = now
    payload["updatedAt"] = now  # legacy mirror
    _strip_missing_and_retry("update", SESSION_TABLE, payload, where={"id": session_id})

def get_session(session_id: str) -> Dict[str, Any]:
    """
    Convenience: fetch a session row (returns {} if absent).
    """
    try:
        resp = _tbl(SESSION_TABLE).select("*").eq("id", session_id).limit(1).execute()
    except Exception:
        return {}
    data = getattr(resp, "data", None)
    if not data:
        return {}
    row = data[0] or {}
    return row if isinstance(row, dict) else {}

# ---------- Analysis storage ----------
def _read_analysis_row_from_table(table: str, session_id: str) -> Optional[Dict[str, Any]]:
    """
    Read from a dedicated analysis table with various plausible shapes.
    Returns the inner analysis blob if found, else None.
    """
    # Try common key names for the foreign key/session id
    for key in ("session_id", "sessionId", "id"):
        try:
            resp = _tbl(table).select("*").eq(key, session_id).limit(1).execute()
            data = getattr(resp, "data", None)
            if data:
                row = data[0] or {}
                if not isinstance(row, dict):
                    continue
                # Accept a variety of column names for the analysis blob
                for col in ("analysis", "data", "blob", "payload"):
                    if isinstance(row.get(col), dict):
                        return row[col]
                # Fallback: if the row itself looks like the analysis blob
                return row
        except Exception:
            continue
    return None

def _write_analysis_row_to_table(table: str, session_id: str, analysis: Dict[str, Any]) -> None:
    """
    Write to a dedicated analysis table. We support several plausible shapes:
    - { session_id, analysis }
    - { sessionId, analysis }
    - { id, analysis }
    Unknown columns are stripped automatically.
    """
    base = {
        "analysis": analysis,
        "updated_at": _now_iso(),
        "updatedAt": _now_iso(),
    }
    # try several shapes in order of preference
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
            # Try next shape
            continue
    # If all shapes failed, last resort: try update by eq filter
    _strip_missing_and_retry("update", table, base, where={"session_id": session_id})

def get_analysis(session_id: str) -> Dict[str, Any]:
    """
    Read the analysis blob for this session.
    Order:
      1) dedicated analysis table (if available)
      2) ChatSession.analysis JSONB field (or legacy report/roleplay aggregation)
    Returns {} if nothing exists.
    """
    table = _analysis_table()
    if table:
        row = _read_analysis_row_from_table(table, session_id)
        if isinstance(row, dict):
            return row

    # Fallback: store analysis on the session row itself (JSONB)
    sess = get_session(session_id)
    if not sess:
        return {}

    # Prefer 'analysis' field; else synthesize from legacy keys if present
    analysis = sess.get("analysis")
    if isinstance(analysis, dict):
        return analysis

    # Build a minimal analysis view from legacy fields if available
    out: Dict[str, Any] = {}
    for k in ("report", "report_history", "roleplay", "summary"):
        if k in sess:
            out[k] = sess[k]
    for k in ("Report", "ReportHistory", "Roleplay", "Summary"):
        if k in sess and k.lower() not in out:
            out[k.lower()] = sess[k]
    return out or {}

# Backwards-compat alias
_get_analysis = get_analysis

def update_analysis(session_id: str, analysis: Dict[str, Any]) -> None:
    """
    Write/update the analysis blob for this session.
    If a dedicated analysis table exists, use it; otherwise write JSONB 'analysis'
    to the ChatSession row.
    """
    table = _analysis_table()
    if table:
        try:
            _write_analysis_row_to_table(table, session_id, analysis)
            return
        except Exception:
            # fall through to session JSONB storage
            pass

    # Store on the session row
    payload = {
        "analysis": analysis,
        "updated_at": _now_iso(),
        "updatedAt": _now_iso(),
    }
    _strip_missing_and_retry("update", SESSION_TABLE, payload, where={"id": session_id})

# Backwards-compat alias
_update_analysis = update_analysis
