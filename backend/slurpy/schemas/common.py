from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class UserRef(BaseModel):
    user_id: str = Field(..., description="Stable user id (e.g., auth sub)")

class SessionRef(BaseModel):
    session_id: str = Field(..., description="Chat session id")

class MessageRef(UserRef, SessionRef):
    pass

class HealthResponse(BaseModel):
    ok: bool = True
    version: Optional[str] = None
    uptime_s: Optional[float] = None
    notes: Optional[str] = None

class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None

class EmptyResponse(BaseModel):
    ok: bool = True
