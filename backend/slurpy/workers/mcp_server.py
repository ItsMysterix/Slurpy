# backend/slurpy/workers/mcp_server.py
"""
Slurpy MCP Server — production-ready (async)

- Loads .env.backend or .env.local
- Optional FastMCP tools (chat, health)
- FastAPI surface:
    * GET  /healthz
    * POST /v1/mcp/chat
    * POST /v1/mcp/stream (NDJSON)
    * POST /api/nlp/analyze
    * POST /api/nlp/redact
- Short in-memory per-user histories
- CLI: --test for one-off local call
"""

from __future__ import annotations

import os
import sys
import argparse
import asyncio
import json
from collections import deque
from typing import Deque, Dict, List, Optional, Tuple, AsyncGenerator

from dotenv import load_dotenv
from loguru import logger
from pydantic import BaseModel

# -------------------------------------------------------------------
# Early env load
# -------------------------------------------------------------------
if os.path.exists(".env.backend"):
    load_dotenv(".env.backend")
    logger.info("Loaded environment from .env.backend")
elif os.path.exists(".env.local"):
    load_dotenv(".env.local")
    logger.info("Loaded environment from .env.local")
else:
    logger.warning("No .env.backend or .env.local found; using system env only.")

if not os.getenv("OPENAI_API_KEY"):
    logger.error("OPENAI_API_KEY missing — pipeline calls may fail until set.")

# Optional: uvloop
try:
    import uvloop  # type: ignore
    uvloop.install()
except Exception:
    pass

# -------------------------------------------------------------------
# Optional FastMCP runtime
# -------------------------------------------------------------------
try:
    from mcp.server.fastmcp import FastMCP  # type: ignore
    _HAS_FASTMCP = True
except Exception:
    _HAS_FASTMCP = False
    logger.warning("FastMCP not available; HTTP routes will still work.")

# ── Core pipeline (root package `backend` exists in your tree)
# NOTE: heavy ML/model modules imported lazily inside handlers to reduce startup memory
_LAZY_IMPORTS = {}

# helper to import heavy pipeline modules on-demand
def _import_pipeline():
    """Attempt to import heavy modules used by the local pipeline.
    Returns a dict with keys: async_slurpy_answer, predict_emotion, analyze_text, analyze_and_redact, warmup_nlp
    Raises ImportError if core modules are not available.
    """
    if _LAZY_IMPORTS:
        return _LAZY_IMPORTS

    try:
        from slurpy.domain.rag.service import async_slurpy_answer as _async_slurpy_answer
        from emotion.predict import predict_emotion as _predict_emotion
        from slurpy.domain.nlp.service import analyze_text as _analyze_text, analyze_and_redact as _analyze_and_redact, warmup_nlp as _warmup_nlp
    except Exception as e:
        raise ImportError(f"local pipeline import failed: {e}") from e

    _LAZY_IMPORTS.update({
        "async_slurpy_answer": _async_slurpy_answer,
        "predict_emotion": _predict_emotion,
        "analyze_text": _analyze_text,
        "analyze_and_redact": _analyze_and_redact,
        "warmup_nlp": _warmup_nlp,
    })
    return _LAZY_IMPORTS

# -------------------------------------------------------------------
# Types & state
# -------------------------------------------------------------------
History = Deque[Tuple[str, str, str]]  # (user_msg, reply, emotion)
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

class NLPIn(BaseModel):
    text: str

_MAX_LEN = 5000

# -------------------------------------------------------------------
# FastMCP tools (optional)
# -------------------------------------------------------------------
if _HAS_FASTMCP:
    mcp = FastMCP("Slurpy")

    @mcp.tool()
    async def chat(user_id: str, message: str) -> dict:
        hist = _get_history(user_id)
        try:
            mods = _import_pipeline()
            result = await mods["async_slurpy_answer"](message, hist, user_id=user_id)
        except ImportError as ie:
            logger.exception("FastMCP: local pipeline unavailable: %s", ie)
            return {"reply": f"Internal error: pipeline unavailable", "emotions": []}
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
                    try:
                        mods = _import_pipeline()
                        _ = mods["predict_emotion"](message)
                    except Exception:
                        pass
                except Exception:
                    pass
            asyncio.create_task(_bg_emotion())

        return out

    @mcp.tool()
    async def health() -> dict:
        return {"status": "ok", "service": "slurpy-mcp"}

# -------------------------------------------------------------------
# FastAPI app
# -------------------------------------------------------------------
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi import APIRouter

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

# --- Warm NLP on startup (avoid first-request lag)
@app.on_event("startup")
async def _warm_models() -> None:
    """
    Start a background warmup task unless explicitly disabled by env.
    - Set MCP_SKIP_WARMUP=1 (or true/yes) in the environment to skip heavy warmup at startup.
    - We warm in a background task so the process can report healthy quickly and avoid OOM kills
      during the initial blocking warmup period. The background warmup will still allocate memory
      but it won't block the startup/health check path.
    """
    skip = os.getenv("MCP_SKIP_WARMUP", "false").lower() in {"1", "true", "yes"}
    if skip:
        logger.info("MCP_SKIP_WARMUP set — skipping heavy NLP warmup at startup")
        return

    async def _do_warm() -> None:
        # Try to import the heavy pipeline; if unavailable, skip warmup.
        mods = None
        try:
            mods = _import_pipeline()
        except ImportError as ie:
            logger.warning("[NLP] warmup skipped — pipeline import failed: %s", ie)
        except Exception as e:
            logger.warning("[NLP] warmup import error: %s", e)

        if mods:
            try:
                mods["warmup_nlp"]()
                logger.info("[NLP] warmup complete")
            except Exception as e:
                logger.warning(f"[NLP] warmup warning: {e}")

        # Best-effort EmotionBrain warmup (feature-gated)
        try:
            from slurpy.domain.nlp.service import get_emotion_brain
            eb = get_emotion_brain()
            if eb is not None:
                eb.warmup()
                logger.info("[EmotionV2] warmup complete")
        except Exception as e:
            logger.warning(f"[EmotionV2] warmup warning: {e}")

    # Schedule background warmup and return immediately so health checks can pass.
    try:
        asyncio.create_task(_do_warm())
    except Exception:
        # If the loop isn't running yet for some reason, run warmup synchronously as fallback.
        try:
            mods = None
            try:
                mods = _import_pipeline()
            except ImportError as ie:
                logger.warning("[NLP] warmup fallback skipped — pipeline import failed: %s", ie)
            if mods:
                try:
                    mods["warmup_nlp"]()
                    logger.info("[NLP] warmup complete (fallback)")
                except Exception as e:
                    logger.warning(f"[NLP] warmup fallback warning: {e}")
        except Exception as e:
            logger.warning(f"[NLP] warmup fallback warning: {e}")

# -------------------------------------------------------------------
# Health
# -------------------------------------------------------------------
@app.get("/healthz")
async def healthz():
    """Simple health check"""
    return {"status": "ok"}

@app.get("/stats")
async def get_stats():
    """Get service statistics including cache performance"""
    try:
        from slurpy.adapters.cache import get_cache
        from slurpy.adapters.qdrant_client import get_qdrant
        
        cache = get_cache()
        cache_stats = cache.stats()
        
        # Get Qdrant stats
        try:
            client = get_qdrant()
            collection_name = os.getenv("QDRANT_COLLECTION", "slurpy_chunks")
            collection_info = client.get_collection(collection_name)
            qdrant_stats = {
                "collection": collection_name,
                "vectors_count": collection_info.vectors_count,
                "points_count": collection_info.points_count,
                "status": str(collection_info.status),
            }
        except Exception as e:
            qdrant_stats = {"error": str(e)}
        
        return {
            "service": "slurpy-mcp",
            "cache": cache_stats,
            "qdrant": qdrant_stats,
            "embedding_model": os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2"),
        }
    except Exception as e:
        return {
            "service": "slurpy-mcp",
            "error": str(e)
        }

@app.delete("/cache")
async def clear_cache():
    """Clear the query cache"""
    try:
        from slurpy.adapters.cache import get_cache
        cache = get_cache()
        cache.clear()
        return {"status": "cache cleared", "service": "slurpy-mcp"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------------------------------------------
# Chat (HTTP)
# -------------------------------------------------------------------
@app.post("/v1/mcp/chat", response_model=ChatResponse)
async def http_chat(req: ChatRequest):
    """Chat endpoint — prefer local pipeline, otherwise proxy to BACKEND_URL/mcp/chat.

    This lazily imports the local pipeline to avoid startup memory spikes. If imports fail
    or the pipeline raises, we forward the request to the main backend so the worker stays
    responsive.
    """
    hist = _get_history(req.user_id)

    # Try local pipeline first (lazy import)
    try:
        mods = _import_pipeline()
        result = await mods["async_slurpy_answer"](req.message, hist, user_id=req.user_id)
    except ImportError as ie:
        logger.warning("Local pipeline unavailable — proxying chat to BACKEND_URL: %s", ie)
        # Proxy to backend
        try:
            import httpx
        except Exception:
            raise HTTPException(status_code=503, detail="Local pipeline unavailable and httpx not installed for proxying")
        backend = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
        url = f"{backend}/mcp/chat"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(url, json={"user_id": req.user_id, "message": req.message}, headers={"Content-Type": "application/json"})
                r.raise_for_status()
                return ChatResponse(**r.json())
        except httpx.HTTPError as e:
            logger.exception("Proxy to backend failed: %s", e)
            raise HTTPException(status_code=502, detail=f"proxy error: {e}")
    except Exception as e:
        logger.exception("❌ async_slurpy_answer crashed")
        # fall through to try proxy
        try:
            import httpx
            backend = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
            url = f"{backend}/mcp/chat"
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(url, json={"user_id": req.user_id, "message": req.message}, headers={"Content-Type": "application/json"})
                r.raise_for_status()
                return ChatResponse(**r.json())
        except Exception:
            raise HTTPException(status_code=500, detail=f"pipeline error: {e}")

    if not result:
        return ChatResponse(reply="Sorry, I couldn't process your message.", emotions=[])

    reply, emotion_label, _fruit = result

    if not emotion_label:
        async def _bg_emotion():
            try:
                # use lazy-loaded predict_emotion if available
                try:
                    mods = _import_pipeline()
                    _ = mods["predict_emotion"](req.message)
                except Exception:
                    pass
            except Exception:
                pass
        asyncio.create_task(_bg_emotion())

    return ChatResponse(reply=reply, emotions=[emotion_label] if emotion_label else [])


# Alias for legacy/no-versioned path
@app.post("/mcp/chat", response_model=ChatResponse)
async def http_chat_alias(req: ChatRequest):
    """Alias to support callers that POST to /mcp/chat (no /v1 prefix)."""
    return await http_chat(req)

# -------------------------------------------------------------------
# NDJSON stream
# -------------------------------------------------------------------
def _nd(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")

@app.post("/v1/mcp/stream")
async def http_stream(req: ChatRequest):
    """NDJSON streaming endpoint.

    Prefer local pipeline (lazy-imported). If unavailable or it errors, proxy the request
    to BACKEND_URL/mcp/stream and stream its response back to the client. This keeps the
    worker responsive even when models can't be loaded locally.
    """
    hist = _get_history(req.user_id)

    # Attempt to load local pipeline
    mods = None
    try:
        mods = _import_pipeline()
    except Exception as ie:
        logger.warning("Local pipeline unavailable — will proxy to BACKEND_URL: %s", ie)

    result = None
    if mods:
        try:
            result = await mods["async_slurpy_answer"](req.message, hist, user_id=req.user_id)
        except Exception as e:
            logger.exception("Local pipeline crashed: %s", e)
            result = None

    # If local pipeline unavailable or failed, proxy to BACKEND_URL/mcp/stream
    if not result:
        try:
            import httpx
        except Exception:
            raise HTTPException(status_code=503, detail="Local pipeline unavailable and proxying not configured")

        backend = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
        url = f"{backend}/mcp/stream"

        async def proxy_stream() -> AsyncGenerator[bytes, None]:
            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("POST", url, json={"user_id": req.user_id, "message": req.message}, headers={"Content-Type": "application/json"}) as r:
                        r.raise_for_status()
                        async for chunk in r.aiter_bytes():
                            yield chunk
            except Exception as e:
                logger.exception("Proxy stream to backend failed: %s", e)
                yield _nd({"type": "start"})
                yield _nd({"type": "delta", "text": f"proxy error: {e}"})
                yield _nd({"type": "done"})

        return StreamingResponse(proxy_stream(), media_type="application/x-ndjson")

    # Stream local result
    reply, emotion_label, fruit = result

    async def gen() -> AsyncGenerator[bytes, None]:
        # Include RAG pipeline metadata in start message to show it worked
        yield _nd({"type": "start", "emotion": emotion_label, "fruit": fruit, "source": "rag_pipeline", "model": "gpt-4o-mini"})
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


# Backwards-compatible aliases: accept requests that target /mcp/stream (no /v1 prefix)
@app.post("/mcp/stream")
async def http_stream_alias(req: ChatRequest):
    """Alias to support callers that POST to /mcp/stream (older or alternative routing)."""
    return await http_stream(req)

# -------------------------------------------------------------------
# NLP endpoints (router + include)
# -------------------------------------------------------------------
router = APIRouter()

@router.post("/api/nlp/analyze")
async def api_nlp_analyze(body: NLPIn):
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if len(body.text) > _MAX_LEN:
        raise HTTPException(status_code=413, detail=f"text too long; max is {_MAX_LEN} chars")
    try:
        mods = _import_pipeline()
        return mods["analyze_text"](body.text)
    except ImportError as ie:
        logger.exception("NLP analyze unavailable: %s", ie)
        raise HTTPException(status_code=503, detail="NLP analyze not available")

@router.post("/api/nlp/redact")
async def api_nlp_redact(body: NLPIn):
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if len(body.text) > _MAX_LEN:
        raise HTTPException(status_code=413, detail=f"text too long; max is {_MAX_LEN} chars")
    try:
        mods = _import_pipeline()
        return mods["analyze_and_redact"](body.text)
    except ImportError as ie:
        logger.exception("NLP redact unavailable: %s", ie)
        raise HTTPException(status_code=503, detail="NLP redact not available")

app.include_router(router)

# ---- Library entrypoint for workers -----------------------------------------
def run(host: str = "0.0.0.0", port: int = 8000, reload: bool = False) -> None:
    """
    Start the MCP worker.
    - If FastMCP is installed, use its runtime.
    - Otherwise, serve the FastAPI app via uvicorn.
    """
    if _HAS_FASTMCP:
        logger.info("Starting Slurpy MCP (FastMCP runtime)...")
        mcp.run()
        return

    try:
        import uvicorn  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "uvicorn is required to run the HTTP server. Install it with `pip install uvicorn`."
        ) from e

    logger.info(f"Starting Slurpy MCP HTTP server on {host}:{port} ...")
    # IMPORTANT: use module path that matches your tree
    uvicorn.run("slurpy.workers.mcp_server:app", host=host, port=port, reload=reload)

# -------------------------------------------------------------------
# CLI entry
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
            hist = _get_history(test_user)
            try:
                mods = _import_pipeline()
                out = await mods["async_slurpy_answer"](test_msg, hist, user_id=test_user)
                from pprint import pprint
                pprint(out)
            except ImportError as ie:
                logger.error("Local pipeline not available for --test: %s", ie)
            except Exception as e:
                logger.exception("Test run failed: %s", e)
        asyncio.run(run_test())
        sys.exit(0)

    if _HAS_FASTMCP:
        logger.info("Starting Slurpy MCP (FastMCP runtime)...")
        mcp.run()
    else:
        logger.error("FastMCP not installed. Run with: uvicorn slurpy.workers.mcp_server:app --reload")
