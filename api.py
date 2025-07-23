"""
api.py — FastAPI gateway for Slurpy with Personality Modes
---------------------------------------------------
• POST /chat   → chats with Slurpy (JWT‑only auth) 
• GET  /modes  → get available personality modes
• GET  /health → liveness probe
"""

from __future__ import annotations

import uuid
from collections import deque
from typing import Deque, Dict, Tuple

from fastapi import Depends, FastAPI, HTTPException, Request, status
from pydantic import BaseModel

from auth_clerk import verify_clerk_token
from rag_core import slurpy_answer, get_available_modes, DEFAULT_MODE

# ─────────────────────────────────────────────────────────────────────────────
def get_clerk_user_id(req: Request) -> str:
    """Extract and verify Clerk token from Authorization header"""
    auth_header = req.headers.get("Authorization", "")
    print("🔐 Authorization Header:", auth_header)

    if not auth_header.startswith("Bearer "):
        print("❌ Missing or malformed token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Clerk session token",
        )

    token = auth_header.split(" ", 1)[1]
    print("🔍 Verifying token...")
    claims = verify_clerk_token(token)
    print("✅ Token verified. User ID:", claims.get("sub"))
    return claims["sub"]

# ─────────────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    text: str
    session_id: str | None = None
    mode: str = DEFAULT_MODE  # NEW: personality mode

class ChatResponse(BaseModel):
    session_id: str
    message: str
    emotion: str
    fruit: str
    mode: str  # NEW: return current mode

class ModeInfo(BaseModel):
    id: str
    emoji: str
    name: str
    description: str

class ModesResponse(BaseModel):
    modes: list[ModeInfo]
    default_mode: str

# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Slurpy RAG API with Personality Modes", version="2.0")

# session memory
History = Deque[Tuple[str, str, str]]
histories: Dict[tuple[str, str], History] = {}

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest, req: Request):
    try:
        print("\n🌐 /chat endpoint hit!")
        print("📝 Payload received:", payload.dict())

        user_id = get_clerk_user_id(req)
        sid = payload.session_id or str(uuid.uuid4())
        mode = payload.mode or DEFAULT_MODE
        
        key = (user_id, sid)
        hist = histories.setdefault(key, deque(maxlen=6))

        print(f"📚 Using session: {sid} for user: {user_id}")
        print(f"🎭 Using mode: {mode}")
        print("💬 Calling slurpy_answer...")

        # Call slurpy_answer with mode parameter
        answer, emotion, fruit = slurpy_answer(payload.text, hist, user_id, mode)

        print("✅ Slurpy replied:", answer)
        return ChatResponse(
            session_id=sid,
            message=answer,
            emotion=emotion,
            fruit=fruit,
            mode=mode
        )
    except Exception as e:
        print("🔥 INTERNAL ERROR:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/modes", response_model=ModesResponse)
async def get_modes_endpoint():
    """Get available personality modes"""
    try:
        modes_data = get_available_modes()
        return ModesResponse(
            modes=[ModeInfo(**mode) for mode in modes_data],
            default_mode=DEFAULT_MODE
        )
    except Exception as e:
        print("🔥 ERROR getting modes:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0-modes"}