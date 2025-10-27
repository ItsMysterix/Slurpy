from __future__ import annotations

import json
import asyncio
from typing import AsyncGenerator, Deque, Dict, Tuple
from collections import deque

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from slurpy.domain.rag.service import async_slurpy_answer
from emotion.predict import predict_emotion

router = APIRouter()

History = Deque[Tuple[str, str, str]]
_HISTORIES: Dict[str, History] = {}

def _get_history(user_id: str) -> History:
    hist = _HISTORIES.get(user_id)
    if hist is None:
        hist = deque(maxlen=6)
        _HISTORIES[user_id] = hist
    return hist


class ChatRequest(BaseModel):
    user_id: str
    message: str


def _nd(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")


@router.post("/stream")
async def http_stream(req: ChatRequest):
    hist = _get_history(req.user_id)
    try:
        result = await async_slurpy_answer(req.message, hist, user_id=req.user_id)
    except Exception as e:
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
        chunk = 160
        for i in range(0, len(reply), chunk):
            yield _nd({"type": "delta", "text": reply[i:i+chunk]})
            await asyncio.sleep(0)
        yield _nd({"type": "done"})
        try:
            hist.append((req.message, reply, emotion_label or "neutral"))
        except Exception:
            pass

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@router.post("/chat")
async def http_chat(req: ChatRequest):
    hist = _get_history(req.user_id)
    try:
        result = await async_slurpy_answer(req.message, hist, user_id=req.user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"pipeline error: {e}")

    if not result:
        return {"reply": "Sorry, I couldn't process your message.", "emotions": []}

    reply, emotion_label, _fruit = result

    if not emotion_label:
        async def _bg_emotion():
            try:
                _ = predict_emotion(req.message)
            except Exception:
                pass
        asyncio.create_task(_bg_emotion())

    return {"reply": reply, "emotions": [emotion_label] if emotion_label else []}
