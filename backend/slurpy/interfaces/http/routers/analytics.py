from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, Query

from slurpy.interfaces.http.deps.auth import get_current_user
from slurpy.domain.analytics.collectors import (
    ensure_session,
    get_session,
    log_event,
)
from slurpy.domain.reports.service import build as build_report

router = APIRouter()

@router.get("/analytics/session/{session_id}")
def read_session(session_id: str, user=Depends(get_current_user)):
    return get_session(session_id)

@router.post("/analytics/ensure-session")
def ensure(user=Depends(get_current_user), session_id: Optional[str] = Query(None)):
    sid = ensure_session(user_id=user["id"], session_id=session_id)
    return {"session_id": sid}

@router.post("/analytics/event")
def add_event(event_type: str, session_id: Optional[str] = Query(None), user=Depends(get_current_user)):
    log_event(user_id=user["id"], event_type=event_type, session_id=session_id)
    return {"ok": True}

@router.get("/analytics/report/{session_id}")
def report(session_id: str, user=Depends(get_current_user)):
    return build_report(session_id, user["id"])
