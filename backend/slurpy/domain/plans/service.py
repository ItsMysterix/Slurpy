# slurpy/domain/plans/service.py
from __future__ import annotations

"""
plans.py — lightweight per-user plan state with resilient Supabase writes.

Public API:
- get_state(user_id) -> Dict[str, Any]
- vote(user_id, themes: List[str]) -> Dict[str, Any]
- roadmap(user_id) -> Dict[str, Any]
"""

import os
import re
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

# ✅ use the adapters path you already created
from slurpy.adapters.supabase_client import supa  # returns a Supabase client

# ─────────────────────────────────────────────────────────────────────────────
# Table detection & caching
# ─────────────────────────────────────────────────────────────────────────────
_FORCE_TABLE = os.getenv("PLANS_TABLE", "").strip() or None
_PLAN_TABLE_CANDIDATES = [
    "plan_state", "user_plans",           # snake_case
    "PlanState", "Plans", "UserPlanState" # legacy/camelCase
]

_MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)
_REL_MISSING_RE = re.compile(r"relation .* does not exist", re.IGNORECASE)

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
    # Some supabase-py versions return a request object requiring .execute(),
    # others already execute. Handle both.
    return req.execute() if hasattr(req, "execute") else req

def _probe_table(name: str) -> bool:
    try:
        _exec(_tbl(_db(), name).select("*").limit(1))
        return True
    except Exception:
        return False

def _plan_table_name() -> Optional[str]:
    global _PLAN_TABLE_NAME
    if _PLAN_TABLE_NAME:
        return _PLAN_TABLE_NAME
    if _FORCE_TABLE and _probe_table(_FORCE_TABLE):
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
    """Strip unknown columns on the fly until the write lands."""
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
                try:
                    req = t.upsert(attempt, on_conflict=on_conflict) if on_conflict else t.upsert(attempt)
                except TypeError:
                    req = t.upsert(attempt)
            else:
                raise ValueError(f"Unsupported action: {action}")
            return _exec(req)
        except Exception as e:
            s = str(e)
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
    "approach": None,
    "phase": "init",
    "steps": [],
    "votes": {},
    "locked_plan": None,
    "updated_at": None,
}

def _shape_state(row: Dict[str, Any]) -> Dict[str, Any]:
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
    if not isinstance(out["steps"], list):
        out["steps"] = []
    else:
        out["steps"] = [str(s) for s in out["steps"] if isinstance(s, (str, int, float))]
    if not isinstance(out["votes"], dict):
        out["votes"] = {}
    return out

def _norm_theme(t: str) -> str:
    t = (t or "").strip()
    return t[len("ongoing_"):] if t.startswith("ongoing_") else t

# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────
def get_state(user_id: str) -> Dict[str, Any]:
    table = _plan_table_name()
    if not table:
        return dict(_DEF_STATE)

    client = _db()
    try:
        resp = _exec(_tbl(client, table).select("*").eq("user_id", user_id).limit(1))
    except Exception:
        try:
            resp = _exec(_tbl(client, table).select("*").eq("userId", user_id).limit(1))
        except Exception:
            return dict(_DEF_STATE)

    data = getattr(resp, "data", None)
    if not data:
        return dict(_DEF_STATE)
    return _shape_state(data[0] or {})

def vote(user_id: str, themes: List[str]) -> Dict[str, Any]:
    table = _plan_table_name()
    if not table:
        return dict(_DEF_STATE)

    cur = get_state(user_id)

    votes = dict(cur.get("votes") or {})
    for t in (themes or []):
        nt = _norm_theme(t)
        if nt:
            votes[nt] = int(votes.get(nt, 0)) + 1

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

    try:
        _strip_missing_and_retry("upsert", table, payload, on_conflict="user_id")
    except Exception:
        try:
            _strip_missing_and_retry("upsert", table, payload)
        except Exception:
            try:
                _strip_missing_and_retry("update", table, payload, where={"user_id": user_id})
            except Exception:
                try:
                    _strip_missing_and_retry("update", table, payload, where={"userId": user_id})
                except Exception:
                    try:
                        _strip_missing_and_retry("insert", table, payload)
                    except Exception:
                        pass

    return {
        "approach": approach,
        "phase": phase,
        "steps": steps,
        "votes": votes,
        "locked_plan": cur.get("locked_plan"),
        "updated_at": now,
    }

def roadmap(user_id: str) -> Dict[str, Any]:
    st = get_state(user_id)
    return {
        "approach": st.get("approach") or "forming",
        "phase": st.get("phase") or "init",
        "steps": list(st.get("steps") or []),
    }

__all__ = ["get_state", "vote", "roadmap"]
