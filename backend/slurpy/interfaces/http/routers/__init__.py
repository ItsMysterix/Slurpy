from __future__ import annotations
from fastapi import APIRouter

from . import health, analytics, cel, memory, plans, rag, roleplay, safety, search, whatever

api = APIRouter()
api.include_router(health.router,  prefix="/health", tags=["health"])
api.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api.include_router(cel.router,      prefix="/cel", tags=["cel"])
api.include_router(memory.router,   prefix="/memory", tags=["memory"])
api.include_router(plans.router,    prefix="/plans", tags=["plans"])
api.include_router(rag.router,      prefix="/rag", tags=["rag"])
api.include_router(roleplay.router, prefix="/roleplay", tags=["roleplay"])
api.include_router(safety.router,   prefix="/safety", tags=["safety"])
api.include_router(search.router,   prefix="/search", tags=["search"])
api.include_router(whatever.router, prefix="/whatever", tags=["misc"])
