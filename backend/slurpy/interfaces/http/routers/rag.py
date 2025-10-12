# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import json
from typing import Optional, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from slurpy.interfaces.http.deps.auth import get_optional_user
from slurpy.domain.rag.service import (
    ann_search,
    async_slurpy_answer,
    get_available_modes,
)

router = APIRouter(prefix="/rag", tags=["rag"])

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _nd(obj: dict) -> bytes:
    """NDJSON line encoder."""
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Public endpoints
#   /rag/rag/modes          GET   → list available chat modes (for UI)
#   /rag/rag/search         GET   → ANN search over your Qdrant collection
#   /rag/rag/chat           POST  → non-streaming chat (compat)
#   /rag/rag/chat/stream    POST  → streaming NDJSON chat (UX boost)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/rag/modes")
def modes():
    """Return available chat modes for the client selector."""
    return {"modes": get_available_modes()}


@router.get("/rag/search")
def search(q: str, k: Optional[int] = None, dataset_id: Optional[str] = None):
    """
    ANN search over your vector store.
    Example:
      GET /rag/rag/search?q=coping%20with%20work%20anxiety&k=5
    """
    return ann_search(q, top_k=k, dataset_id=dataset_id)


@router.post("/rag/chat")
async def chat(
    msg: str,
    mode: str = "default",
    session_id: Optional[str] = None,
    user=Depends(get_optional_user),
):
    """
    Non-streaming chat (kept for compatibility).
    Params are passed as query string: ?msg=...&mode=therapist
    """
    from collections import deque

    user_id = (user or {}).get("id") if user else "anonymous"
    hist = deque(maxlen=6)

    try:
        result = await async_slurpy_answer(
            msg, hist, user_id=user_id, mode=mode, session_id=session_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"pipeline error: {e}")

    if not result:
        return {
            "reply": "Sorry, I couldn't process your message.",
            "emotion": None,
            "fruit": None,
        }

    reply, emotion, fruit = result
    return {"reply": reply, "emotion": emotion, "fruit": fruit}


@router.post("/rag/chat/stream")
async def chat_stream(
    msg: str,
    mode: str = "default",
    session_id: Optional[str] = None,
    user=Depends(get_optional_user),
):
    """
    Streaming chat via NDJSON (greatly improves perceived latency).

    Stream format:
      {"type":"start","emotion":"...","fruit":"..."}
      {"type":"delta","text":"..." }
      ... (multiple)
      {"type":"done"}
    """
    from collections import deque

    user_id = (user or {}).get("id") if user else "anonymous"
    hist = deque(maxlen=6)

    try:
        result = await async_slurpy_answer(
            msg, hist, user_id=user_id, mode=mode, session_id=session_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"pipeline error: {e}")

    async def _fail() -> AsyncGenerator[bytes, None]:
        yield _nd({"type": "start"})
        yield _nd({"type": "delta", "text": "Sorry, I couldn't process your message."})
        yield _nd({"type": "done"})

    if not result:
        return StreamingResponse(_fail(), media_type="application/x-ndjson")

    reply, emotion, fruit = result

    async def gen() -> AsyncGenerator[bytes, None]:
        # Kickoff frame so the UI can show typing indicator + emotion pill
        yield _nd({"type": "start", "emotion": emotion, "fruit": fruit})

        # Chunk the final string to simulate token flow (easy swap-in later
        # if you move to real token streaming).
        chunk = 160
        for i in range(0, len(reply), chunk):
            yield _nd({"type": "delta", "text": reply[i : i + chunk]})
            # Cooperative yield; keeps the loop responsive.
            await asyncio.sleep(0)

        yield _nd({"type": "done"})

    return StreamingResponse(gen(), media_type="application/x-ndjson")
