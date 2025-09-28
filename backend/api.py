# -*- coding: utf-8 -*-
"""
api.py — FastAPI gateway for Slurpy with Personality Modes
----------------------------------------------------------
• POST /chat         → classic (non-streaming) chat (JWT-only auth, optional DEV bypass)
• POST /chat_stream  → streaming NDJSON (typewriter UI)
• GET  /modes        → list personality modes + default
• GET  /health       → liveness (legacy)
• GET  /healthz      → liveness (for Fly checks)
• GET  /             → simple 200 OK root

Env
- API_DEBUG              (true/false)    → verbose logs
- DEV_NO_AUTH            (true/false)    → bypass Clerk verification, use "dev_user"
- FRONTEND_ORIGIN        (e.g. http://localhost:3000 or CSV list)
- CORS_ALLOW_ALL         (true/false)    → allow all origins (debug only)
- OPENAI_API_KEY         → used for /chat_stream (direct streaming)
- OPENAI_MODEL           → defaults to gpt-4o-mini
- OPENAI_TEMPERATURE     → defaults to 0.7
- API_MAX_SESSIONS       → in-memory history cap (default 5000)
- API_SESSION_TTL_SEC    → session TTL for history cache (default 86400)
"""

from __future__ import annotations

import os
import json
import uuid
import asyncio
import traceback
from time import time
from collections import deque
from typing import Deque, Dict, Tuple, AsyncGenerator

import httpx
from fastapi import FastAPI, HTTPException, Request, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.auth_clerk import verify_clerk_token
from backend.rag_core import (
    slurpy_answer,
    get_available_modes,
    DEFAULT_MODE,
    emotion_intensity,     # used for CEL and meta
    build_stream_prompt,   # used for streaming prompt construction
)
from backend.cel import make_patch

# Optional: async OpenAI streaming client
try:
    from openai import AsyncOpenAI
    _ASYNC_OPENAI_AVAILABLE = True
except Exception:  # pragma: no cover
    AsyncOpenAI = None
    _ASYNC_OPENAI_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────────────────
# Debug toggle
DEBUG = os.getenv("API_DEBUG", "false").lower() in {"1", "true", "yes"}

def dbg(*args, **kwargs):
    if DEBUG:
        print(*args, **kwargs)

# ─────────────────────────────────────────────────────────────────────────────
# App + CORS
app = FastAPI(title="Slurpy RAG API with Personality Modes", version="2.2")

# ─────────────────────────────────────────────────────────────────────────────
# MCP wiring (proxy to the separate MCP service)
# Set MCP_BASE_URL on the backend app to enable this (e.g., https://slurpy-mcp.fly.dev)
MCP_BASE_URL = os.getenv("MCP_BASE_URL", "").rstrip("/")

def _mcp_url(path: str) -> str:
    if not MCP_BASE_URL:
        # 503 keeps your API up even if MCP is not configured/deployed yet
        raise HTTPException(status_code=503, detail="MCP not configured")
    return f"{MCP_BASE_URL}{path}"

@app.get("/v1/mcp/healthz")
async def mcp_health_proxy():
    # optional convenience check from backend → MCP
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            r = await client.get(_mcp_url("/healthz"))
            return {
                "ok": r.status_code == 200,
                "upstream": r.json()
                if r.headers.get("content-type", "").startswith("application/json")
                else r.text,
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}

@app.post("/v1/mcp/chat")
async def mcp_chat_proxy(req: Request, payload: ChatRequest = Body(...)):
    """
    Fast path to MCP (non-streaming). Translates your ChatRequest → MCP schema.
    MCP expects: { user_id, message }
    """
    user_id = get_clerk_user_id(req)
    body = {"user_id": user_id, "message": payload.text}
    headers = {}
    auth = req.headers.get("authorization") or req.headers.get("Authorization")
    if auth:
        headers["Authorization"] = auth
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(_mcp_url("/v1/mcp/chat"), json=body, headers=headers)
        # pass-through upstream JSON (MCP returns {"reply": "...", "emotions": [...]})
        r.raise_for_status()
        return r.json()

@app.post("/v1/mcp/stream")
async def mcp_stream_proxy(req: Request, payload: ChatRequest = Body(...)):
    """
    Fast path to MCP (streaming NDJSON). Keeps your UI typewriter-fast.
    """
    user_id = get_clerk_user_id(req)
    body = {"user_id": user_id, "message": payload.text}
    headers = {"Accept": "application/x-ndjson"}
    auth = req.headers.get("authorization") or req.headers.get("Authorization")
    if auth:
        headers["Authorization"] = auth

    async def _gen():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                _mcp_url("/v1/mcp/stream"),
                json=body,
                headers=headers,
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_raw():
                    if chunk:
                        yield chunk

    return StreamingResponse(_gen(), media_type="application/x-ndjson")

_frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
_allow_all = os.getenv("CORS_ALLOW_ALL", "false").lower() in {"1", "true", "yes"}

_allowed_origins = (
    ["*"]
    if _allow_all
    else [o.strip() for o in _frontend_origin.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Auth helper
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
_last_seen: Dict[tuple[str, str], float] = {}

MAX_SESSIONS = int(os.getenv("API_MAX_SESSIONS", "5000"))
SESSION_TTL = int(os.getenv("API_SESSION_TTL_SEC", "86400"))  # 24h

def _touch(key: tuple[str, str]) -> None:
    _last_seen[key] = time()

def _gc_histories() -> None:
    """Simple LRU/TTL GC to keep memory bounded under load."""
    if len(histories) <= MAX_SESSIONS:
        return
    cutoff = time() - SESSION_TTL
    # drop oldest/expired first
    for k, ts in sorted(_last_seen.items(), key=lambda kv: kv[1]):
        if ts < cutoff or len(histories) > MAX_SESSIONS:
            histories.pop(k, None)
            _last_seen.pop(k, None)
        else:
            break

def _sanitize_mode(requested: str) -> str:
    try:
        available_ids = {m["id"] for m in get_available_modes()}
        return requested if requested in available_ids else DEFAULT_MODE
    except Exception:
        return DEFAULT_MODE

# ─────────────────────────────────────────────────────────────────────────────
# Health + root endpoints (make Fly happy)
@app.get("/")
async def root():
    """Root endpoint for basic service check."""
    return {"ok": True, "service": "slurpy-api", "version": "2.2"}

@app.get("/health")
async def health():
    """Legacy health check endpoint."""
    return {"status": "ok", "version": "2.2-modes+stream-async"}

@app.get("/healthz")
async def healthz():
    """Health check endpoint for Fly.io and K8s."""
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# Modes endpoint
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
        _gc_histories()
        hist = histories.setdefault(key, deque(maxlen=6))
        _touch(key)

        dbg(f"📚 Using session: {sid} for user: {user_id}")
        dbg(f"🎭 Using mode: {mode}")

        # ── CEL: classify + plan BEFORE calling core (offload local ML to a thread)
        loop = asyncio.get_running_loop()
        try:
            label, prob = await loop.run_in_executor(None, lambda: emotion_intensity(payload.text))
            dbg(f"🧪 Emotion classified: {label} ({prob:.2f})")
        except Exception as _e:
            dbg(f"⚠️ Emotion classification failed: {_e}")
            label, prob = ("neutral", 0.0)

        patch = make_patch(label, float(prob), mode, text=payload.text)
        dbg(f"🧩 CEL patch → tool_hint={patch.tool_hint} safety={getattr(patch, 'safety', None)}")

        # Optional early safety exit
        if getattr(patch, "safety", None) == "crisis":
            crisis_msg = (
                "I'm concerned about your safety. Please reach out now: "
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
        # slurpy_answer is sync; run in a thread to avoid blocking
        result = await loop.run_in_executor(
            None,
            lambda: slurpy_answer(payload.text, hist, user_id=user_id, mode=mode, session_id=sid),
        )

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
        print("🔥 INTERNAL ERROR in /chat:", repr(e))
        if DEBUG:
            traceback.print_exc()
        raise HTTPException(status_code=500, detail="Server error")

# ─────────────────────────────────────────────────────────────────────────────
# Streaming NDJSON endpoint for typewriter UI
#
# Events:
#  { "type":"start", "session_id":"...", "mode":"...", "tool_hint": "Breathing" | null }
#  { "type":"meta",  "emotion":"anxious", "fruit":"🍌" }
#  { "type":"delta", "text":"<token-or-chunk>" }
#  { "type":"done" }
#
@app.post("/chat_stream")
async def chat_stream(payload: ChatRequest, req: Request):
    # Validate early
    if not payload.text or not isinstance(payload.text, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'text' is required.",
        )
    if not _ASYNC_OPENAI_AVAILABLE or not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI SDK not available for streaming")

    user_id = get_clerk_user_id(req)
    sid = payload.session_id or str(uuid.uuid4())
    mode = _sanitize_mode(payload.mode or DEFAULT_MODE)

    key = (user_id, sid)
    _gc_histories()
    hist = histories.setdefault(key, deque(maxlen=6))
    _touch(key)

    # CEL pre-check (offload local ML to a thread)
    loop = asyncio.get_running_loop()
    try:
        label, prob = await loop.run_in_executor(None, lambda: emotion_intensity(payload.text))
        patch = make_patch(label, float(prob), mode, text=payload.text)
        dbg(f"🧩 [stream] CEL → hint={patch.tool_hint} safety={getattr(patch, 'safety', None)}")
        if getattr(patch, "safety", None) == "crisis":
            async def crisis_stream() -> AsyncGenerator[bytes, None]:
                yield _nd({"type": "start", "session_id": sid, "mode": mode, "tool_hint": None})
                yield _nd({"type": "meta", "emotion": "crisis", "fruit": "🆘"})
                yield _nd({"type": "delta", "text": "I'm concerned about your safety. Please reach out now: call or text 988 in the US, or contact your local emergency services."})
                yield _nd({"type": "done"})
            return _streaming_response(crisis_stream())
    except Exception as _e:
        dbg(f"⚠️ [stream] CEL failed: {_e}")
        class _Patch:
            tool_hint = None
            user_preface = None
        patch = _Patch()

    # Build prompt (fast; no model call)
    prompt_meta = build_stream_prompt(payload.text, hist, user_id=user_id, mode=mode)
    full_prompt = prompt_meta["full_prompt"]
    emotion_guess = prompt_meta["user_emotion"]
    fruit = prompt_meta["fruit"]

    # Prepare shared async OpenAI client
    if not _ASYNC_OPENAI_AVAILABLE or AsyncOpenAI is None:
        raise HTTPException(status_code=500, detail="OpenAI AsyncClient not available")
    CLIENT = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    temperature = float(os.getenv("OPENAI_TEMPERATURE", "0.7"))

    # Stream generator
    async def token_gen() -> AsyncGenerator[bytes, None]:
        # Start + meta events
        yield _nd({"type": "start", "session_id": sid, "mode": mode, "tool_hint": getattr(patch, "tool_hint", None)})
        yield _nd({"type": "meta", "emotion": emotion_guess, "fruit": fruit})

        # Optional empathy preface first (helps immediacy)
        preface = (getattr(patch, "user_preface", "") or "").strip()
        combined = ""
        if preface:
            yield _nd({"type": "delta", "text": preface + "\n\n"})
            combined += preface + "\n\n"

        try:
            stream = await CLIENT.chat.completions.create(
                model=model,
                stream=True,
                temperature=temperature,
                max_tokens=400,
                messages=[{"role": "user", "content": full_prompt}],
            )
            async for event in stream:
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

        # Update in-memory history (no DB writes here)
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
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=DEBUG,
        log_level="debug" if DEBUG else "info",
    )