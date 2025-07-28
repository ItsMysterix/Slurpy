# -*- coding: utf-8 -*-
"""
api.py — FastAPI gateway for Slurpy with Personality Modes
----------------------------------------------------------
• POST /chat   → chats with Slurpy (JWT‑only auth, optional DEV bypass)
• GET  /modes  → list personality modes + default
• GET  /health → liveness

Env
- API_DEBUG            (true/false)    → verbose logs
- DEV_NO_AUTH          (true/false)    → bypass Clerk verification, use "dev_user"
- FRONTEND_ORIGIN      (e.g. http://localhost:3000) → CORS allowlist
"""

from __future__ import annotations

import os
import uuid
from collections import deque
from typing import Deque, Dict, Tuple

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth_clerk import verify_clerk_token
from rag_core import slurpy_answer, get_available_modes, DEFAULT_MODE

# ─────────────────────────────────────────────────────────────────────────────
# Debug toggle
DEBUG = os.getenv("API_DEBUG", "false").lower() in {"1", "true", "yes"}

def dbg(*args, **kwargs):
    if DEBUG:
        print(*args, **kwargs)

# ─────────────────────────────────────────────────────────────────────────────
# App + CORS
app = FastAPI(title="Slurpy RAG API with Personality Modes", version="2.0")

_frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").strip()
_allow_all = os.getenv("CORS_ALLOW_ALL", "false").lower() in {"1", "true", "yes"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else [_frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
def get_clerk_user_id(req: Request) -> str:
    """Extract and verify Clerk token from Authorization header."""
    # Local/dev bypass (optional)
    if os.getenv("DEV_NO_AUTH", "false").lower() in {"1", "true", "yes"}:
        return "dev_user"

    auth_header = req.headers.get("Authorization", "")
    dbg("🔐 Authorization Header:", auth_header)

    if not auth_header.startswith("Bearer "):
        dbg("❌ Missing or malformed token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Clerk session token",
        )

    token = auth_header.split(" ", 1)[1]
    dbg("🔍 Verifying token...")
    claims = verify_clerk_token(token)
    dbg("✅ Token verified. User ID:", claims.get("sub"))

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Clerk token (no subject)",
        )
    return sub

# ─────────────────────────────────────────────────────────────────────────────
# Models
class ChatRequest(BaseModel):
    text: str = Field(..., description="User message content")
    session_id: str | None = Field(
        default=None, description="Optional session ID to continue a conversation"
    )
    mode: str = Field(
        default=DEFAULT_MODE,
        description="Personality mode (e.g., therapist, coach, friend, poet, monk, lover)",
    )

class ChatResponse(BaseModel):
    session_id: str
    message: str
    emotion: str
    fruit: str
    mode: str

class ModeInfo(BaseModel):
    id: str
    emoji: str
    name: str
    description: str

class ModesResponse(BaseModel):
    modes: list[ModeInfo]
    default_mode: str

# ─────────────────────────────────────────────────────────────────────────────
# In‑memory session history per (user_id, session_id)
History = Deque[Tuple[str, str, str]]  # (user_text, assistant_text, user_emotion)
histories: Dict[tuple[str, str], History] = {}

def _sanitize_mode(requested: str) -> str:
    try:
        available_ids = {m["id"] for m in get_available_modes()}
        return requested if requested in available_ids else DEFAULT_MODE
    except Exception:
        # If something goes wrong fetching modes, fall back to default
        return DEFAULT_MODE

# ─────────────────────────────────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest, req: Request):
    try:
        dbg("\n🌐 /chat endpoint hit!")
        dbg("📝 Payload received:", payload.dict())

        # Basic validation
        if not payload.text or not isinstance(payload.text, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Field 'text' is required.",
            )

        user_id = get_clerk_user_id(req)
        sid = payload.session_id or str(uuid.uuid4())
        mode = _sanitize_mode(payload.mode or DEFAULT_MODE)

        key = (user_id, sid)
        hist = histories.setdefault(key, deque(maxlen=6))

        dbg(f"📚 Using session: {sid} for user: {user_id}")
        dbg(f"🎭 Using mode: {mode}")
        dbg("💬 Calling slurpy_answer...")

        # Ensure rag_core uses the SAME session_id we use here
        answer, emotion, fruit = slurpy_answer(
            payload.text,
            hist,
            user_id=user_id,
            mode=mode,
            session_id=sid,  # ← pass through session id
        )

        dbg("✅ Slurpy replied:", answer)

        return ChatResponse(
            session_id=sid,
            message=answer,
            emotion=emotion,
            fruit=fruit,
            mode=mode,
        )
    except HTTPException:
        raise
    except Exception as e:
        # Keep internal details out of client; use server logs for debugging
        print("🔥 INTERNAL ERROR:", str(e))
        raise HTTPException(status_code=500, detail="Server error")

# ─────────────────────────────────────────────────────────────────────────────
@app.get("/modes", response_model=ModesResponse)
async def get_modes_endpoint():
    """Return available personality modes and the default."""
    try:
        modes_data = get_available_modes()
        return ModesResponse(
            modes=[ModeInfo(**mode) for mode in modes_data],
            default_mode=DEFAULT_MODE,
        )
    except Exception as e:
        print("🔥 ERROR getting modes:", str(e))
        raise HTTPException(status_code=500, detail="Server error")

# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0-modes"}

# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Optional: run directly (useful for quick testing)
    import uvicorn
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=DEBUG,
        log_level="debug" if DEBUG else "info",
    )
