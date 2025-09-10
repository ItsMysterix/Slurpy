# backend/report.py
from __future__ import annotations

import datetime
from typing import Any, Dict

# --- Flexible imports for analytics (handles both underscored & public APIs) ---
try:
    # Older/internal style
    from .analytics import _get_analysis as get_analysis  # type: ignore
    from .analytics import _update_analysis as update_analysis  # type: ignore
except Exception:
    # Newer/public style
    from .analytics import get_analysis, update_analysis  # type: ignore

from .ufm import get as get_ufm
from .plans import get_state, roadmap as get_roadmap


def _utc_iso() -> str:
    """UTC RFC3339 with trailing Z, e.g., 2025-09-01T12:34:56.789012Z"""
    return datetime.datetime.utcnow().isoformat() + "Z"


def build(session_id: str, user_id: str) -> Dict[str, Any]:
    """
    Assemble a session report using the agreed schema and persist it into analytics.

    Schema (report):
    {
        "session_id": str,
        "user_id": str,
        "ufm": dict,         # user feeling/mood or unified feature map (whatever your get_ufm returns)
        "plan": dict,        # safe plan state (no assumptions about optional keys)
        "roadmap": list,     # list-like roadmap for the session
        "generated_at": str  # UTC ISO timestamp with Z
    }
    """

    # Fetch components with safe fallbacks to keep TypedDict optional keys from exploding
    ufm = get_ufm(session_id) or {}
    plan_state = get_state(session_id) or {}
    roadmap_items = get_roadmap(session_id) or []

    report: Dict[str, Any] = {
        "session_id": session_id,
        "user_id": user_id,
        "ufm": ufm,
        "plan": plan_state,
        "roadmap": roadmap_items,
        "generated_at": _utc_iso(),
    }

    # Load existing analysis blob (or create a fresh one)
    analysis = get_analysis(session_id) or {}

    # Persist using a stable key. Keep a history list if it already exists.
    # - analysis["report"] holds the latest snapshot (fast access)
    # - analysis["report_history"] preserves an append-only timeline (auditable)
    history = analysis.get("report_history")
    if not isinstance(history, list):
        history = []
    history.append(report)

    analysis["report"] = report
    analysis["report_history"] = history

    # Write back
    update_analysis(session_id, analysis)

    return report
