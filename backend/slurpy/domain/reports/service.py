# slurpy/domain/reports/service.py
# -*- coding: utf-8 -*-
"""
Session report assembly (safe, fast, prod-ready).

Builds a compact session report and persists it inside the analytics “analysis”
blob, keeping both the latest snapshot and an append-only history.
"""

from __future__ import annotations
from typing import Any, Dict, Optional
from datetime import datetime, timezone

# --- analytics (resilient to where you placed it) ----------------------------
try:
    # preferred: your collectors/service file under domain.analytics
    from slurpy.domain.analytics.collectors import get_analysis as get_analysis  # type: ignore
    from slurpy.domain.analytics.collectors import update_analysis as update_analysis  # type: ignore
except Exception:
    try:
        from slurpy.domain.analytics.service import get_analysis, update_analysis  # type: ignore
    except Exception:  # final fallback (older layout)
        from backend.analytics import get_analysis, update_analysis  # type: ignore

# --- plans state -------------------------------------------------------------
try:
    from slurpy.domain.plans.service import get_state as plans_get_state, roadmap as plans_roadmap
except Exception:
    # legacy fallback
    from slurpy.domain.plans import get_state as plans_get_state, roadmap as plans_roadmap  # type: ignore

# --- UFM (location may vary in your repo) ------------------------------------
ufm_get: Optional[object]
try:
    from slurpy.ufm import get as ufm_get  # type: ignore
except Exception:
    try:
        from backend.ufm import get as ufm_get  # type: ignore
    except Exception:
        ufm_get = None  # type: ignore


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
    """
    if ufm_get is None:  # type: ignore[truthy-function]
        return {}
    try:
        return _safe(ufm_get(session_id=session_id, user_id=user_id))  # type: ignore
    except TypeError:
        pass
    except Exception:
        return {}
    try:
        return _safe(ufm_get(session_id))  # type: ignore[arg-type]
    except TypeError:
        pass
    except Exception:
        return {}
    try:
        return _safe(ufm_get(user_id))  # type: ignore[arg-type]
    except Exception:
        return {}


def build(session_id: str, user_id: str) -> Dict[str, Any]:
    """
    Assemble a session report and persist it into analytics.analysis.
    Never raises (failures degrade gracefully).
    """
    ufm = _best_effort_ufm(session_id, user_id)
    plan_state = _safe(plans_get_state(user_id))
    roadmap = _safe(plans_roadmap(user_id))

    report: Dict[str, Any] = {
        "session_id": session_id,
        "user_id": user_id,
        "ufm": ufm,
        "plan": plan_state,
        "roadmap": roadmap,
        "generated_at": _utc_iso_z(),
    }

    # Load existing blob and append history
    try:
        analysis = get_analysis(session_id) or {}
    except Exception:
        analysis = {}

    history = analysis.get("report_history")
    if not isinstance(history, list):
        history = []
    history.append(report)

    analysis["report"] = report
    analysis["report_history"] = history

    try:
        update_analysis(session_id, analysis)
    except Exception:
        pass  # best-effort persistence

    return report


async def build_async(session_id: str, user_id: str) -> Dict[str, Any]:
    import asyncio
    return await asyncio.to_thread(build, session_id, user_id)


__all__ = ["build", "build_async"]
