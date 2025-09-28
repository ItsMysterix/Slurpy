# backend/mcp_server.py
"""
Slurpy MCP Server — production-ready (async)

- Loads .env.backend or .env.local
- Async MCP tools (chat, health)
- HTTP/ASGI wrapper (FastAPI) for Fly:
    * GET  /healthz
    * POST /v1/mcp/chat
    * POST /v1/mcp/stream   (NDJSON; chunked for immediacy)
- Keeps short per-user histories (fast local context)
- Optional --test CLI flag for a single local call
"""

from __future__ import annotations

import os
import sys
import argparse
import asyncio
import json
from collections import deque
from typing import Deque, Dict, List, Optional, Tuple, AsyncGenerator

from pydantic import BaseModel
from dotenv import load_dotenv
from loguru import logger

# -------------------------------------------------------------------
# Load environment early
# -------------------------------------------------------------------
if os.path.exists(".env.backend"):
    load_dotenv(".env.backend")
    logger.info("Loaded environment from .env.backend")
elif os.path.exists(".env.local"):
    load_dotenv(".env.local")
    logger.info("Loaded environment from .env.local")
else:
    logger.warning("No .env.backend or .env.local found! Using system env only.")

if not os.getenv("OPENAI_API_KEY"):
    logger.error("⚠️ OPENAI_API_KEY missing — pipeline calls may fail until set.")

# Optional: uvloop for lower asyncio overhead
try:
    import uvloop  # type: ignore
    uvloop.install()
except Exception:
    pass

# -------------------------------------------------------------------
# MCP core (existing)
# -------------------------------------------------------------------
try:
    from mcp.server.fastmcp import FastMCP
    _HAS_FASTMCP = True
except Exception:
    _HAS_FASTMCP = False
    logger.warning("FastMCP not available; HTTP routes will still work.")

from backend.rag_core import async_slurpy_answer  # -> Optional[Tuple[str, str, str]]
from emotion.predict import predict_emotion       # fallback if pipeline didn't return emotion

# Types
History = Deque[Tuple[str, str, str]]
_HISTORIES: Dict[str, History] = {}

def _get_history(user_id: str) -> History:
    hist = _HISTORIES.get(user_id)
    if hist is None:
        hist = deque(maxlen=6)
        _HISTORIES[user_id] = hist
    return hist

# -------------------------------------------------------------------
# Schemas
# -------------------------------------------------------------------
class ChatRequest(BaseModel):
    user_id: str
    message: str

class ChatResponse(BaseModel):
    reply: str
    emotions: Optional[List[str]] = None

# -------------------------------------------------------------------
# FastMCP tools (kept)
# -------------------------------------------------------------------
if _HAS_FASTMCP:
    mcp = FastMCP("Slurpy")

    @mcp.tool()
    async def chat(user_id: str, message: str) -> dict:
        hist = _get_history(user_id)
        try:
            result = await async_slurpy_answer(message, hist, user_id=user_id)
        except Exception as e:
            logger.exception("❌ async_slurpy_answer crashed")
            return {"reply": f"Internal error: {e}", "emotions": []}

        if not result:
            return {"reply": "Sorry, I couldn't process your message.", "emotions": []}

        reply, emotion_label, _fruit = result
        out = {"reply": reply, "emotions": [emotion_label] if emotion_label else []}

        if not emotion_label:
            async def _bg_emotion():
                try:
                    emo = predict_emotion(message)
                    logger.debug(f"[emo-bg] predicted={emo}")
                except Exception:
                    pass
            asyncio.create_task(_bg_emotion())

        return out

    @mcp.tool()
    async def health() -> dict:
        return {"status": "ok", "service": "slurpy-mcp"}

# -------------------------------------------------------------------
# HTTP/ASGI surface (FastAPI) for Fly
# -------------------------------------------------------------------
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="Slurpy MCP", version="1.0")

_FRONTEND = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
_ALLOW_ALL = os.getenv("CORS_ALLOW_ALL", "false").lower() in {"1", "true", "yes"}
_ALLOWED = ["*"] if _ALLOW_ALL else [o.strip() for o in _FRONTEND.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
async def healthz():
    return {"ok": True, "service": "slurpy-mcp"}

@app.post("/v1/mcp/chat", response_model=ChatResponse)
async def http_chat(req: ChatRequest):
    hist = _get_history(req.user_id)
    try:
        result = await async_slurpy_answer(req.message, hist, user_id=req.user_id)
    except Exception as e:
        logger.exception("❌ async_slurpy_answer crashed")
        raise HTTPException(status_code=500, detail=f"pipeline error: {e}")

    if not result:
        return ChatResponse(reply="Sorry, I couldn't process your message.", emotions=[])

    reply, emotion_label, _fruit = result
    if not emotion_label:
        # background emotion (non-blocking)
        async def _bg_emotion():
            try:
                emo = predict_emotion(req.message)
                logger.debug(f"[emo-bg] predicted={emo}")
            except Exception:
                pass
        asyncio.create_task(_bg_emotion())

    return ChatResponse(reply=reply, emotions=[emotion_label] if emotion_label else [])

# Cheap NDJSON streaming: chunk the full reply so UI starts painting immediately
def _nd(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")

@app.post("/v1/mcp/stream")
async def http_stream(req: ChatRequest):
    hist = _get_history(req.user_id)
    try:
        result = await async_slurpy_answer(req.message, hist, user_id=req.user_id)
    except Exception as e:
        logger.exception("❌ async_slurpy_answer crashed")
        raise HTTPException(status_code=500, detail=f"pipeline error: {e}")

    if not result:
        async def _fail() -> AsyncGenerator[bytes, None]:
            yield _nd({"type": "start"})
            yield _nd({"type": "delta", "text": "Sorry, I couldn't process your message."})
            yield _nd({"type": "done"})
        return StreamingResponse(_fail(), media_type="application/x-ndjson")

    reply, emotion_label, fruit = result

    async def gen() -> AsyncGenerator[bytes, None]:
        yield _nd({"type": "start", "emotion": emotion_label, "fruit": fruit})
        # stream in small chunks for immediacy
        chunk = 160
        for i in range(0, len(reply), chunk):
            yield _nd({"type": "delta", "text": reply[i:i+chunk]})
            await asyncio.sleep(0)  # yield control
        yield _nd({"type": "done"})
        # record history after sending
        try:
            hist.append((req.message, reply, emotion_label or "neutral"))
        except Exception:
            pass

    return StreamingResponse(gen(), media_type="application/x-ndjson")

# -------------------------------------------------------------------
# CLI entrypoint (unchanged behavior)
# -------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Slurpy MCP server")
    parser.add_argument("--test", action="store_true", help="Run one test chat and exit")
    parser.add_argument("--reset-histories", action="store_true", help="Clear in-memory histories before start")
    args = parser.parse_args()

    if args.reset_histories:
        _HISTORIES.clear()
        logger.info("🧹 Cleared in-memory histories")

    if args.test:
        async def run_test():
            test_user = "local_user"
            test_msg = "I feel anxious about my exams, why do I always overthink?"
            # Try HTTP path locally by calling async_slurpy_answer directly
            hist = _get_history(test_user)
            out = await async_slurpy_answer(test_msg, hist, user_id=test_user)
            from pprint import pprint
            pprint(out)
        asyncio.run(run_test())
        sys.exit(0)

    # If you still want to run the FastMCP runtime locally:
    if _HAS_FASTMCP:
        logger.info("🚀 Starting Slurpy MCP (FastMCP runtime)...")
        mcp.run()
    else:
        logger.error("FastMCP not installed. Run this module under uvicorn for HTTP: uvicorn backend.mcp_server:app --reload")
