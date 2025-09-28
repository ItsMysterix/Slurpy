# backend/plans.py
from __future__ import annotations

"""
plans.py — lightweight per-user plan state with resilient Supabase writes.

Public API (sync; safe to call from threads):
- get_state(user_id) -> Dict[str, Any]
- vote(user_id, themes: List[str]) -> Dict[str, Any]
- roadmap(user_id) -> Dict[str, Any]

Design goals:
- Ultra-robust: never crash callers; fall back to in-memory defaults if DB unavailable.
- Cross-schema: supports snake_case and legacy camelCase columns/tables.
- Fast: caches detected table name; minimizes round-trips.
- Scales: idempotent upserts; strips unknown columns on-the-fly to tolerate schema drift.
"""

import os
import re
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from .supa import supa  # returns a Supabase client

# ─────────────────────────────────────────────────────────────────────────────
# Table detection & caching
# You can force the table via env PLANS_TABLE to skip probing.
# Otherwise we probe a few candidates once and cache the name.
# ─────────────────────────────────────────────────────────────────────────────
_FORCE_TABLE = os.getenv("PLANS_TABLE", "").strip() or None
_PLAN_TABLE_CANDIDATES = [
    "plan_state", "user_plans",           # snake_case first
    "PlanState", "Plans", "UserPlanState" # legacy/camelCase
]

# Regex helpers
_MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)
_REL_MISSING_RE = re.compile(r"relation .* does not exist", re.IGNORECASE)

# Module cache for the detected table to avoid repeated probes
_PLAN_TABLE_NAME: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────────────
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
    try:
        _tbl(_db(), name).select("*").limit(1).execute()
        return True
    except Exception:
        return False

def _plan_table_name() -> Optional[str]:
    global _PLAN_TABLE_NAME
    if _PLAN_TABLE_NAME:
        return _PLAN_TABLE_NAME
    if _FORCE_TABLE:
        # If forced table doesn't exist, we still try once (will fall back if it errors in use)
        if _probe_table(_FORCE_TABLE):
            _PLAN_TABLE_NAME = _FORCE_TABLE
            return _PLAN_TABLE_NAME
    for t in _PLAN_TABLE_CANDIDATES:
        if _probe_table(t):
            _PLAN_TABLE_NAME = t
            return _PLAN_TABLE_NAME
    return None

def _strip_missing_and_retry(
    action: str,
    table: str,
    payload: Dict[str, Any],
    where: Optional[Dict[str, Any]] = None,
    on_conflict: Optional[str] = None,
):
    """
    Try a write; if PostgREST says a column is missing, strip it and retry until it lands.
    action ∈ {"insert","update","upsert"}.
    """
    client = _db()
    attempt = dict(payload)
    while True:
        try:
            t = _tbl(client, table)
            if action == "insert":
                req = t.insert(attempt)
            elif action == "update":
                req = t.update(attempt)
                if where:
                    for k, v in where.items():
                        req = req.eq(k, v)
            elif action == "upsert":
                # Some client versions accept on_conflict; if not, fallback to simple upsert
                try:
                    req = t.upsert(attempt, on_conflict=on_conflict) if on_conflict else t.upsert(attempt)
                except TypeError:
                    req = t.upsert(attempt)
            else:
                raise ValueError(f"Unsupported action: {action}")
            return _exec(req)
        except Exception as e:
            s = str(e)
            # If the table itself doesn't exist, bubble up so caller can fallback
            if _REL_MISSING_RE.search(s):
                raise
            m = _MISSING_COL_RE.search(s)
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
# Defaults & shaping
# ─────────────────────────────────────────────────────────────────────────────
_DEF_STATE: Dict[str, Any] = {
    "approach": None,            # e.g., "CBT micro-steps", "mindfulness"
    "phase": "init",             # "init" | "build" | "stabilize" | "maintain"
    "steps": [],                 # list[str]
    "votes": {},                 # dict[str,int] theme→count
    "locked_plan": None,         # optional dict
    "updated_at": None,
}

def _shape_state(row: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize DB row variants into our canonical shape."""
    if not isinstance(row, dict):
        return dict(_DEF_STATE)
    out = dict(_DEF_STATE)
    out.update({
        "approach": row.get("approach") or row.get("planApproach"),
        "phase": row.get("phase") or row.get("planPhase") or "init",
        "steps": row.get("steps") or row.get("planSteps") or [],
        "votes": row.get("votes") or {},
        "locked_plan": row.get("locked_plan") or row.get("lockedPlan"),
        "updated_at": row.get("updated_at") or row.get("updatedAt"),
    })
    # normalize types
    if not isinstance(out["steps"], list):
        out["steps"] = []
    else:
        # coerce to list[str]
        out["steps"] = [str(s) for s in out["steps"] if isinstance(s, (str, int, float))]
    if not isinstance(out["votes"], dict):
        out["votes"] = {}
    return out

def _norm_theme(t: str) -> str:
    """Normalize theme names (e.g., drop 'ongoing_' prefix)."""
    t = (t or "").strip()
    if t.startswith("ongoing_"):
        return t[len("ongoing_"):]
    return t

# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────
def get_state(user_id: str) -> Dict[str, Any]:
    """
    Return the user's plan state or a safe default. Never crashes.
    """
    table = _plan_table_name()
    if not table:
        return dict(_DEF_STATE)

    client = _db()
    resp = None
    # Try snake_case first, then camel
    try:
        resp = _tbl(client, table).select("*").eq("user_id", user_id).limit(1).execute()
    except Exception:
        try:
            resp = _tbl(client, table).select("*").eq("userId", user_id).limit(1).execute()
        except Exception:
            return dict(_DEF_STATE)

    data = getattr(resp, "data", None)
    if not data:
        return dict(_DEF_STATE)

    row = data[0] or {}
    return _shape_state(row)

def vote(user_id: str, themes: List[str]) -> Dict[str, Any]:
    """
    Increment votes for current themes, update approach/phase/steps lightly,
    and upsert. Returns the updated state (shaped).
    """
    table = _plan_table_name()
    if not table:
        return dict(_DEF_STATE)

    cur = get_state(user_id)

    # increment theme votes (normalize names; ignore empties)
    votes = dict(cur.get("votes") or {})
    for t in (themes or []):
        nt = _norm_theme(t)
        if not nt:
            continue
        votes[nt] = int(votes.get(nt, 0)) + 1

    # super-simple heuristics (tweak later as you wish)
    approach = cur.get("approach")
    phase = cur.get("phase") or "init"
    steps = list(cur.get("steps") or [])

    if not approach:
        if any(x in votes for x in ("anxiety", "work_stress")):
            approach = "CBT micro-exposures"
        elif any(x in votes for x in ("depression", "self_esteem")):
            approach = "behavioral activation + self-talk"
        elif any(x in votes for x in ("relationships", "grief")):
            approach = "attachment-aware reflection"
        else:
            approach = "forming"

    if phase == "init" and votes and sum(votes.values()) >= 3:
        phase = "build"

    if not steps:
        # seed a couple of generic steps so UI has something to chew on
        steps = ["1-min breath anchor", "1 tiny action before bed"]

    now = _now_iso()
    payload = {
        # snake_case
        "user_id": user_id,
        "approach": approach,
        "phase": phase,
        "steps": steps,
        "votes": votes,
        "updated_at": now,
        # camelCase (legacy)
        "userId": user_id,
        "planApproach": approach,
        "planPhase": phase,
        "planSteps": steps,
        "updatedAt": now,
    }

    # Prefer upsert on user_id if supported; otherwise fallback to update/insert flow
    try:
        _strip_missing_and_retry("upsert", table, payload, on_conflict="user_id")
    except Exception:
        try:
            _strip_missing_and_retry("upsert", table, payload)  # some schemas rely on PK=id with unique constraint
        except Exception:
            # fallback dance if upsert not supported
            try:
                _strip_missing_and_retry("update", table, payload, where={"user_id": user_id})
            except Exception:
                try:
                    _strip_missing_and_retry("update", table, payload, where={"userId": user_id})
                except Exception:
                    # last resort: insert (may duplicate if no unique constraint; acceptable as best-effort)
                    try:
                        _strip_missing_and_retry("insert", table, payload)
                    except Exception:
                        # swallow; return shaped in-memory result
                        pass

    # return shaped
    return {
        "approach": approach,
        "phase": phase,
        "steps": steps,
        "votes": votes,
        "locked_plan": cur.get("locked_plan"),
        "updated_at": now,
    }

def roadmap(user_id: str) -> Dict[str, Any]:
    """
    Convert state → UI-friendly roadmap.
    Always returns keys: approach, phase, steps (list[str]).
    """
    st = get_state(user_id)
    return {
        "approach": st.get("approach") or "forming",
        "phase": st.get("phase") or "init",
        "steps": list(st.get("steps") or []),
    }
