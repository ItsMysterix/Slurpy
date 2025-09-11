# -*- coding: utf-8 -*-
"""
api.py — FastAPI gateway for Slurpy with Personality Modes
----------------------------------------------------------
• POST /chat         → classic (non-streaming) chat (JWT-only auth, optional DEV bypass)
• POST /chat_stream  → streaming NDJSON (typewriter UI)
• GET  /modes        → list personality modes + default
• GET  /health       → liveness

Env
- API_DEBUG            (true/false)    → verbose logs
- DEV_NO_AUTH          (true/false)    → bypass Clerk verification, use "dev_user"
- FRONTEND_ORIGIN      (e.g. http://localhost:3000) → CORS allowlist
- CORS_ALLOW_ALL       (true/false)    → allow all origins (debug only)
- OPENAI_API_KEY       → used for /chat_stream (direct streaming)
- OPENAI_MODEL         → defaults to gpt-4o-mini
"""

from __future__ import annotations

import os
import json
import uuid
import inspect
import traceback
from collections import deque
from typing import Deque, Dict, Tuple, AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.auth_clerk import verify_clerk_token
from backend.rag_core import (
    slurpy_answer,
    get_available_modes,
    DEFAULT_MODE,
    emotion_intensity,     # used for CEL
    build_stream_prompt,   # used for streaming prompt construction
)
from backend.cel import make_patch

# Optional: stream directly with OpenAI SDK
try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # will error at runtime if /chat_stream is called

# ─────────────────────────────────────────────────────────────────────────────
# Debug toggle
DEBUG = os.getenv("API_DEBUG", "false").lower() in {"1", "true", "yes"}

def dbg(*args, **kwargs):
    if DEBUG:
        print(*args, **kwargs)

# ─────────────────────────────────────────────────────────────────────────────
# App + CORS
app = FastAPI(title="Slurpy RAG API with Personality Modes", version="2.1")

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
    """Extract and verify Clerk token from Authorization header. Returns 401 on any auth error."""
    # Local/dev bypass (optional)
    if os.getenv("DEV_NO_AUTH", "false").lower() in {"1", "true", "yes"}:
        return "dev_user"

    auth_header = req.headers.get("authorization") or req.headers.get("Authorization") or ""
    dbg("🔐 Authorization header present:", bool(auth_header))

    if not auth_header.startswith("Bearer "):
        dbg("❌ Missing or malformed token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Clerk session token",
        )

    token = auth_header.split(" ", 1)[1].strip()
    try:
        dbg("🔍 Verifying token...")
        claims = verify_clerk_token(token)
        sub = claims.get("sub") or claims.get("user_id")
        dbg("✅ Token verified. User ID (sub):", sub)
        if not sub:
            raise HTTPException(status_code=401, detail="Invalid Clerk token (no subject)")
        return sub
    except HTTPException:
        raise
    except Exception as e:
        # Never leak internal errors for auth; log and return 401
        if DEBUG:
            print("🔒 Clerk verify error:", repr(e))
            traceback.print_exc()
        raise HTTPException(status_code=401, detail="Invalid Clerk session token")

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
    tool_hint: str | None = None  # CEL suggestions (e.g., "Breathing")

class ModeInfo(BaseModel):
    id: str
    emoji: str
    name: str
    description: str

class ModesResponse(BaseModel):
    modes: list[ModeInfo]
    default_mode: str

# ─────────────────────────────────────────────────────────────────────────────
# In-memory session history per (user_id, session_id)
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
# Classic non-streaming endpoint
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest, req: Request):
    try:
        dbg("\n🌐 /chat endpoint hit!")
        dbg("📝 Payload keys:", list(payload.dict().keys()))

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

        # ── CEL: classify + plan BEFORE calling core (for safety gate)
        try:
            label, prob = emotion_intensity(payload.text)
            dbg(f"🧪 Emotion classified: {label} ({prob:.2f})")
        except Exception as _e:
            # If classifier hiccups, fall back to neutral
            dbg(f"⚠️ Emotion classification failed: {_e}")
            label, prob = ("neutral", 0.0)

        patch = make_patch(label, float(prob), mode, text=payload.text)
        dbg(f"🧩 CEL patch → tool_hint={patch.tool_hint} safety={getattr(patch, 'safety', None)}")

        # Optional early safety exit
        if getattr(patch, "safety", None) == "crisis":
            crisis_msg = (
                "I’m concerned about your safety. Please reach out now: "
                "call or text 988 in the US, or contact your local emergency services."
            )
            dbg("⛑️ Crisis path taken; returning safety message.")
            return ChatResponse(
                session_id=sid,
                message=crisis_msg,
                emotion="crisis",
                fruit="🆘",
                mode=mode,
                tool_hint=None,
            )

        dbg("💬 Calling slurpy_answer...")
        result = slurpy_answer(
            payload.text,
            hist,
            user_id=user_id,
            mode=mode,
            session_id=sid,  # ← pass through session id
        )
        # 🔧 Support async implementations
        if inspect.isawaitable(result):
            result = await result

        # Defensive handling of result shape
        if result is None:
            dbg("⚠️ slurpy_answer returned None; using fallback values.")
            answer = "(no response)"
            answer_emotion = "neutral"
            fruit = "🍋"
        else:
            try:
                answer, answer_emotion, fruit = result
            except Exception as _e:
                dbg("⚠️ slurpy_answer returned unexpected value; using fallback:", _e)
                answer = str(result)
                answer_emotion = "neutral"
                fruit = "🍋"

        # ── CEL: optional empathy preface AFTER core response
        preface = (getattr(patch, "user_preface", "") or "").strip()
        final_message = f"{preface}\n\n{answer}".strip() if preface else answer

        return ChatResponse(
            session_id=sid,
            message=final_message,
            emotion=answer_emotion or label or "neutral",
            fruit=fruit,
            mode=mode,
            tool_hint=getattr(patch, "tool_hint", None),
        )
    except HTTPException:
        raise
    except Exception as e:
        # Keep internal details out of client; use server logs for debugging
        print("🔥 INTERNAL ERROR in /chat:", repr(e))
        if DEBUG:
            traceback.print_exc()
        raise HTTPException(status_code=500, detail="Server error")

# ─────────────────────────────────────────────────────────────────────────────
# Streaming NDJSON endpoint for typewriter UI
#
# Event shapes:
#  { "type":"start", "session_id":"...", "mode":"...", "tool_hint": "Breathing" | null }
#  { "type":"meta",  "emotion":"anxious", "fruit":"🍌" }
#  { "type":"delta", "text":"<token-or-chunk>" }
#  { "type":"done" }
#
@app.post("/chat_stream")
async def chat_stream(payload: ChatRequest, req: Request):
    # Validate early to fail fast before opening stream
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

    # CEL pre-check (no DB writes here)
    try:
        label, prob = emotion_intensity(payload.text)
        patch = make_patch(label, float(prob), mode, text=payload.text)
        dbg(f"🧩 [stream] CEL → hint={patch.tool_hint} safety={getattr(patch, 'safety', None)}")
        if getattr(patch, "safety", None) == "crisis":
            async def crisis_stream() -> AsyncGenerator[bytes, None]:
                yield _nd({"type": "start", "session_id": sid, "mode": mode, "tool_hint": None})
                yield _nd({"type": "meta", "emotion": "crisis", "fruit": "🆘"})
                yield _nd({"type": "delta", "text": "I’m concerned about your safety. Please reach out now: call or text 988 in the US, or contact your local emergency services."})
                yield _nd({"type": "done"})
            return _streaming_response(crisis_stream())
    except Exception as _e:
        dbg(f"⚠️ [stream] CEL failed: {_e}")
        # minimal fallback object
        class _Patch: 
            tool_hint = None
            user_preface = None
        patch = _Patch()

    # Build prompt (fast; no model call)
    prompt_meta = build_stream_prompt(payload.text, hist, user_id=user_id, mode=mode)
    full_prompt = prompt_meta["full_prompt"]
    emotion_guess = prompt_meta["user_emotion"]
    fruit = prompt_meta["fruit"]

    # Prepare OpenAI client
    if OpenAI is None:
        raise HTTPException(status_code=500, detail="OpenAI SDK not available for streaming")
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    temperature = float(os.getenv("OPENAI_TEMPERATURE", "0.7"))

    # Stream generator
    async def token_gen() -> AsyncGenerator[bytes, None]:
        # Start + meta events
        yield _nd({"type": "start", "session_id": sid, "mode": mode, "tool_hint": getattr(patch, "tool_hint", None)})
        yield _nd({"type": "meta", "emotion": emotion_guess, "fruit": fruit})

        # Optionally stream an empathy preface first (helps immediacy)
        preface = (getattr(patch, "user_preface", "") or "").strip()
        combined = ""

        if preface:
            yield _nd({"type": "delta", "text": preface + "\n\n"})
            combined += preface + "\n\n"

        try:
            # OpenAI Chat Completions streaming (synchronous iterator)
            stream = client.chat.completions.create(
                model=model,
                stream=True,
                temperature=temperature,
                max_tokens=400,
                messages=[{"role": "user", "content": full_prompt}],
            )
            for event in stream:
                if not event.choices:
                    continue
                piece = event.choices[0].delta.content or ""
                if piece:
                    combined += piece
                    yield _nd({"type": "delta", "text": piece})
        except Exception as e:
            dbg("🔥 Streaming error:", e)
            if DEBUG:
                traceback.print_exc()
            yield _nd({"type": "delta", "text": "\n\n(temporary hiccup while streaming; message may be truncated) "})

        # Close event
        yield _nd({"type": "done"})

        # Update in-memory history so next turn has context (no DB writes here)
        try:
            final_text = combined.strip() if combined.strip() else "(no content)"
            hist.append((payload.text, final_text, emotion_guess))
        except Exception as _e:
            dbg("⚠️ Could not append to history after stream:", _e)

    return _streaming_response(token_gen())

# Helpers for NDJSON streaming
def _nd(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")

def _streaming_response(gen: AsyncGenerator[bytes, None]) -> StreamingResponse:
    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # for nginx
    }
    # NDJSON (one JSON object per line)
    return StreamingResponse(gen, media_type="application/x-ndjson", headers=headers)

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
        if DEBUG:
            traceback.print_exc()
        raise HTTPException(status_code=500, detail="Server error")

# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.1-modes+stream"}

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
