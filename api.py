"""
api.py — FastAPI gateway for Slurpy (debug edition)
---------------------------------------------------
• POST /chat   → chats with Slurpy (JWT‑only auth)
• GET  /health → liveness probe
"""

from __future__ import annotations

import uuid
from collections import deque
from typing import Deque, Dict, Tuple

from fastapi import Depends, FastAPI, HTTPException, Request, status
from pydantic import BaseModel

from auth_clerk import verify_clerk_token
from rag_core import slurpy_answer

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


class ChatResponse(BaseModel):
    session_id: str
    message: str
    emotion: str
    fruit: str

# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Slurpy RAG API", version="debug-mode")

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
        key = (user_id, sid)
        hist = histories.setdefault(key, deque(maxlen=6))

        print(f"📚 Using session: {sid} for user: {user_id}")
        print("💬 Calling slurpy_answer...")

        answer, emotion, fruit = slurpy_answer(payload.text, hist, user_id)

        print("✅ Slurpy replied:", answer)
        return ChatResponse(
            session_id=sid,
            message=answer,
            emotion=emotion,
            fruit=fruit,
        )
    except Exception as e:
        print("🔥 INTERNAL ERROR:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok"}
