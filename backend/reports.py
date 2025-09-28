# -*- coding: utf-8 -*-
"""
reports.py — Session report assembly (safe, fast, prod-ready)

Builds a compact session report and persists it inside the analytics “analysis”
blob, keeping both the latest snapshot and an append-only history.

Schema:
{
  "session_id": str,
  "user_id": str,
  "ufm": dict,        # unified feature map / feelings summary (best-effort)
  "plan": dict,       # current planning state (approach/phase/steps/votes…)
  "roadmap": dict,    # UI-friendly roadmap: {"approach","phase","steps":[]}
  "generated_at": str # UTC ISO8601 with Z
}
"""

from __future__ import annotations

from typing import Any, Dict
from datetime import datetime, timezone

# Flexible analytics imports (back-compat aliases exist in analytics.py)
try:
    from .analytics import _get_analysis as get_analysis  # type: ignore
    from .analytics import _update_analysis as update_analysis  # type: ignore
except Exception:
    from .analytics import get_analysis, update_analysis  # type: ignore

# Plan state API (see plans.py)
from .plans import get_state as plans_get_state, roadmap as plans_roadmap

# UFM may expose different signatures across versions; we’ll call defensively.
try:
    from .ufm import get as ufm_get  # type: ignore
except Exception:  # pragma: no cover
    ufm_get = None  # type: ignore


# ─────────────────────────────────────────────────────────────────────────────
def _utc_iso_z() -> str:
    """UTC RFC3339 with trailing Z, e.g., 2025-09-01T12:34:56.789012Z"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe(obj: Any) -> Dict[str, Any]:
    return obj if isinstance(obj, dict) else {}


def _best_effort_ufm(session_id: str, user_id: str) -> Dict[str, Any]:
    """
    Call ufm.get() with tolerant signatures:
      1) get(session_id=session_id, user_id=user_id)
      2) get(session_id)
      3) get(user_id)
    Returns {} on any failure or unknown signature.
    """
    if ufm_get is None:
        return {}
    try:
        # Most expressive first (kwargs)
        return _safe(ufm_get(session_id=session_id, user_id=user_id))  # type: ignore
    except TypeError:
        pass
    except Exception:
        return {}
    try:
        # Maybe session-scoped
        return _safe(ufm_get(session_id))  # type: ignore[arg-type]
    except TypeError:
        pass
    except Exception:
        return {}
    try:
        # Maybe user-scoped
        return _safe(ufm_get(user_id))  # type: ignore[arg-type]
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────────────────────
def build(session_id: str, user_id: str) -> Dict[str, Any]:
    """
    Assemble a session report and persist it into analytics.analysis.

    Returns the report dict. Never raises (failures degrade gracefully).
    """
    # Fetch components (all best-effort & type-safe)
    ufm = _best_effort_ufm(session_id, user_id)

    # plans.py expects user_id (earlier version mistakenly passed session_id)
    plan_state = _safe(plans_get_state(user_id))
    roadmap = _safe(plans_roadmap(user_id))  # {"approach","phase","steps":[]}

    report: Dict[str, Any] = {
        "session_id": session_id,
        "user_id": user_id,
        "ufm": ufm,
        "plan": plan_state,
        "roadmap": roadmap,
        "generated_at": _utc_iso_z(),
    }

    # Load existing analysis blob ({} if absent)
    try:
        analysis = get_analysis(session_id) or {}
    except Exception:
        analysis = {}

    # Maintain latest snapshot + append-only history
    history = analysis.get("report_history")
    if not isinstance(history, list):
        history = []
    history.append(report)

    analysis["report"] = report
    analysis["report_history"] = history

    try:
        update_analysis(session_id, analysis)
    except Exception:
        # Swallow analytics write issues (report still returned to caller)
        pass

    return report


# Optional async convenience wrapper (non-blocking in async stacks)
async def build_async(session_id: str, user_id: str) -> Dict[str, Any]:
    import asyncio
    return await asyncio.to_thread(build, session_id, user_id)


__all__ = ["build", "build_async"]
