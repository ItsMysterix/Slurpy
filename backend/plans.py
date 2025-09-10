# backend/plans.py
from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import re

from .supa import supa  # NOTE: this is a function in your project

# Candidate table names; we’ll probe which one exists at runtime.
_PLAN_TABLE_CANDIDATES = ["PlanState", "Plans", "UserPlanState", "plan_state", "user_plans"]

_MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)

# --------- utils ---------
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
        _tbl(client, name).select("*").limit(1).execute()
        return True
    except Exception:
        return False

def _plan_table_name() -> Optional[str]:
    for t in _PLAN_TABLE_CANDIDATES:
        if _probe_table(t):
            return t
    return None

def _exec(req):
    return req.execute()

def _strip_missing_and_retry(action: str, table: str, payload: Dict[str, Any], where: Optional[Dict[str, Any]] = None):
    """
    Write, and if PostgREST says a column is missing, strip it and retry.
    action ∈ {"upsert", "insert", "update"}
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
                raise
            missing = m.group(1)
            if missing in attempt:
                attempt.pop(missing, None)
                if not attempt:
                    return None
            else:
                raise

# --------- defaults & shaping ---------
_DEF_STATE: Dict[str, Any] = {
    "approach": None,            # e.g., "CBT micro-steps", "mindfulness", etc.
    "phase": "init",             # "init" | "build" | "stabilize" | "maintain"
    "steps": [],                 # list[str]
    "votes": {},                 # dict[str,int] theme→count
    "locked_plan": None,         # optional dict
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
    # normalize types
    if not isinstance(out["steps"], list):
        out["steps"] = []
    if not isinstance(out["votes"], dict):
        out["votes"] = {}
    return out

# --------- public API ---------
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

    # increment theme votes
    votes = dict(cur.get("votes") or {})
    for t in (themes or []):
        if not t:
            continue
        votes[t] = int(votes.get(t, 0)) + 1

    # super-simple heuristics (tweak later as you wish)
    approach = cur.get("approach")
    phase = cur.get("phase") or "init"
    steps = list(cur.get("steps") or [])

    if not approach:
        if any(t.startswith("anxiety") or t == "anxiety" for t in themes):
            approach = "CBT micro-exposures"
        elif any(t in {"depression", "self_esteem"} for t in themes):
            approach = "behavioral activation + self-talk"
        elif any(t in {"relationships", "grief"} for t in themes):
            approach = "attachment-aware reflection"
        else:
            approach = "forming"

    if phase == "init" and votes and sum(votes.values()) >= 3:
        phase = "build"

    if not steps:
        # seed a couple of generic steps so UI has something to chew on
        steps = ["1-min breath anchor", "1 tiny action before bed"]

    payload = {
        # snake_case
        "user_id": user_id,
        "approach": approach,
        "phase": phase,
        "steps": steps,
        "votes": votes,
        "updated_at": _now_iso(),
        # camelCase (legacy)
        "userId": user_id,
        "planApproach": approach,
        "planPhase": phase,
        "planSteps": steps,
        "updatedAt": _now_iso(),
    }

    try:
        _strip_missing_and_retry("upsert", table, payload)
    except Exception:
        # fallback dance if upsert not supported
        try:
            _strip_missing_and_retry("update", table, payload, where={"user_id": user_id})
        except Exception:
            _strip_missing_and_retry("update", table, payload, where={"userId": user_id})

    # return shaped
    return {
        "approach": approach,
        "phase": phase,
        "steps": steps,
        "votes": votes,
        "locked_plan": cur.get("locked_plan"),
        "updated_at": _now_iso(),
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
