# backend/slurpy/interfaces/http/main.py
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# absolute imports that match your package layout
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

    # mount routers
    app.include_router(health.router,    prefix="/health",    tags=["health"])
    app.include_router(search.router,    prefix="/search",    tags=["search"])
    app.include_router(rag.router,       prefix="/rag",       tags=["rag"])
    app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
    app.include_router(cel.router,       prefix="/cel",       tags=["cel"])
    app.include_router(plans.router,     prefix="/plans",     tags=["plans"])
    app.include_router(memory.router,    prefix="/memory",    tags=["memory"])
    app.include_router(roleplay.router,  prefix="/roleplay",  tags=["roleplay"])
    app.include_router(safety.router,    prefix="/safety",    tags=["safety"])
    app.include_router(whatever.router,  prefix="/whatever",  tags=["misc"])
    app.include_router(mcp.router,       prefix="/mcp",       tags=["mcp"])

    return app

app = create_app()
