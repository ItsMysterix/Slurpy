from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

try:
    from slurpy.adapters.supabase_client import supa, supa_ping
except Exception:  # pragma: no cover
    supa = None  # type: ignore
    supa_ping = lambda readonly=True: False  # type: ignore

log = logging.getLogger("slurpy.analytics.agg")

T_MESSAGES = "chat_messages"

def emotion_counts(session_id: str) -> Dict[str, int]:
    """
    Return {emotion: count} for a session. Best-effort; empty dict on failure.
    """
    try:
        if not supa_ping(True) or supa is None:
            return {}
        client = supa()
        # pull just what's needed; aggregate client-side (simple & safe)
        res = client.table(T_MESSAGES).select("emotion").eq("session_id", session_id).limit(2000).execute()
        rows = getattr(res, "data", []) or []
        out: Dict[str, int] = {}
        for r in rows:
            e = (r.get("emotion") or "unknown").lower()
            out[e] = out.get(e, 0) + 1
        return out
    except Exception as e:
        log.warning("emotion_counts failed: %s", e)
        return {}

def last_n(session_id: str, n: int = 20) -> List[Dict[str, Any]]:
    """
    Return last N messages (role, text, emotion, intensity, ts).
    """
    try:
        if not supa_ping(True) or supa is None:
            return []
        client = supa()
        res = (
            client.table(T_MESSAGES)
            .select("role,text,emotion,intensity,ts")
            .eq("session_id", session_id)
            .order("ts", desc=True)
            .limit(n)
            .execute()
        )
        return list(getattr(res, "data", []) or [])
    except Exception as e:
        log.warning("last_n failed: %s", e)
        return []
