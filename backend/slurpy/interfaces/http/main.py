# backend/slurpy/interfaces/http/main.py
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import logging
import traceback
import uuid

# Import model-specific exception so we can return a helpful 503 when model
# artifacts are missing. The module itself uses lazy-loading so this import
# won't attempt to load heavy model files at import time.
try:
    from emotion.predict import ModelNotAvailableError
except Exception:
    # If the module isn't importable for some unexpected reason, define a
    # fallback base exception so our handlers still work.
    class ModelNotAvailableError(Exception):
        pass

# configure a basic logger for the application
logger = logging.getLogger("slurpy")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Note: router imports are intentionally performed inside create_app()
# to avoid triggering heavy application-level side-effects (database or
# external-client initialization) at module import time. Importing
# routers at top-level previously caused the module import to fail when
# environment variables (e.g. QDRANT_URL) weren't set.

def create_app() -> FastAPI:
    app = FastAPI(title="Slurpy API", version="0.1.0")

    # CORS - PRODUCTION: Update with your actual domains!
    # TODO: Replace ["*"] with your production domains before deploying
    allowed_origins = [
        "http://localhost:3000",      # Local development
        "http://localhost:3001",      # Local development alternative
        # "https://your-domain.com",  # Add your production frontend domain
        # "https://www.your-domain.com",
    ]
    
    # In production, read from environment variable
    import os
    env_origins = os.getenv("ALLOWED_ORIGINS")
    if env_origins:
        allowed_origins.extend(env_origins.split(","))
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins if os.getenv("ENVIRONMENT") == "production" else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # simple liveness
    @app.get("/_/ping")
    def _ping():
        return {"ok": True}

    # Exception handlers that give richer error information while still
    # generating a request_id so you can correlate logs. These handlers
    # log full tracebacks server-side but return concise structured JSON
    # including the exception type and message so clients see more detail.

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        req_id = str(uuid.uuid4())
        logger.warning("HTTPException %s %s %s", req_id, exc.status_code, exc.detail)
        # include brief detail for clients and a request id for tracing
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "http_error",
                "status_code": exc.status_code,
                "message": exc.detail,
                "request_id": req_id,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        req_id = str(uuid.uuid4())
        logger.warning("ValidationError %s %s", req_id, exc)
        return JSONResponse(
            status_code=422,
            content={
                "error": "validation_error",
                "message": "Invalid request payload",
                "details": exc.errors(),
                "request_id": req_id,
            },
        )

    @app.exception_handler(ModelNotAvailableError)
    async def model_unavailable_handler(request: Request, exc: Exception):
        req_id = str(uuid.uuid4())
        logger.warning("ModelNotAvailable %s %s", req_id, exc)
        return JSONResponse(
            status_code=503,
            content={
                "error": "model_unavailable",
                "message": str(exc),
                "request_id": req_id,
                "hint": "Model artifacts missing or failed to load. Restore files to /app/emotion/model or configure a model downloader.",
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        req_id = str(uuid.uuid4())
        # Log full traceback server-side for troubleshooting
        tb = traceback.format_exc()
        logger.error("Unhandled exception %s %s\n%s", req_id, exc, tb)
        # Return structured error to the client with the exception type and message
        return JSONResponse(
            status_code=500,
            content={
                "error": "server_error",
                "type": exc.__class__.__name__,
                "message": str(exc),
                "request_id": req_id,
            },
        )

    # Import routers here to avoid import-time side-effects. If importing
    # the real routers fails (for example because an external dependency
    # like QDRANT_URL isn't set), log the error and mount lightweight
    # fallback routers that return 503 so the app stays up and gives
    # informative errors instead of crashing at import time.
    try:
        from slurpy.interfaces.http.routers import (
            health,
            search,
            rag,
            analytics,
            cel,
            plans,
            memory,
            roleplay,
            safety,
            whatever,
            mcp,
        )
    except Exception as imp_err:
        logger.exception("Failed to import routers: %s", imp_err)
        # build simple fallback routers that return 503 for their root path
        from fastapi import APIRouter

        def _fallback_router(name: str):
            r = APIRouter()

            @r.get("/", response_class=JSONResponse)
            def _root():
                return JSONResponse(
                    status_code=503,
                    content={
                        "error": "service_unavailable",
                        "service": name,
                        "message": "Dependency failed to initialize",
                        "detail": str(imp_err),
                    },
                )

            return r

        health = _fallback_router("health")
        search = _fallback_router("search")
        rag = _fallback_router("rag")
        analytics = _fallback_router("analytics")
        cel = _fallback_router("cel")
        plans = _fallback_router("plans")
        memory = _fallback_router("memory")
        roleplay = _fallback_router("roleplay")
        safety = _fallback_router("safety")
        whatever = _fallback_router("whatever")
        mcp = _fallback_router("mcp")

    # mount routers (support either module objects that expose `.router`
    # or plain APIRouter instances used as fallbacks)
    def _router_obj(r):
        return getattr(r, "router", r)

    app.include_router(_router_obj(health),    prefix="/health",    tags=["health"])
    app.include_router(_router_obj(search),    prefix="/search",    tags=["search"])
    app.include_router(_router_obj(rag),       prefix="/rag",       tags=["rag"])
    app.include_router(_router_obj(analytics), prefix="/analytics", tags=["analytics"])
    app.include_router(_router_obj(cel),       prefix="/cel",       tags=["cel"])
    app.include_router(_router_obj(plans),     prefix="/plans",     tags=["plans"])
    app.include_router(_router_obj(memory),    prefix="/memory",    tags=["memory"])
    app.include_router(_router_obj(roleplay),  prefix="/roleplay",  tags=["roleplay"])
    app.include_router(_router_obj(safety),    prefix="/safety",    tags=["safety"])
    app.include_router(_router_obj(whatever),  prefix="/whatever",  tags=["misc"])
    app.include_router(_router_obj(mcp),       prefix="/mcp",       tags=["mcp"])

    return app

app = create_app()
