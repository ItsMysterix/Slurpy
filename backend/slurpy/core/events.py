from __future__ import annotations

import logging
from typing import Literal, cast
from fastapi import FastAPI

from slurpy.core.config import get_settings
from slurpy.core.logging import setup_logging
from slurpy.adapters.embedder import embedder_ready
from slurpy.adapters.qdrant_client import get_qdrant
from slurpy.adapters.supabase_client import supa_ping

log = logging.getLogger("slurpy.core")


def _startup_health() -> None:
    """
    Best-effort “are the basics alive” checks.
    Never raises; logs warnings so the app still boots in dev.
    """
    ok_embed = False
    try:
        ok_embed = embedder_ready()
    except Exception:
        pass
    if not ok_embed:
        log.warning("embedder not ready (will degrade search/recall)")

    try:
        cli = get_qdrant()
        # cheap smoke: list collections (will raise on bad URL/auth)
        cli.get_collections()
    except Exception as e:
        log.warning("qdrant not reachable: %s", e)

    try:
        if not supa_ping(readonly=True):
            log.warning("supabase ping failed (readonly)")
    except Exception as e:
        log.warning("supabase ping error: %s", e)

def register_lifecycle(app: FastAPI) -> None:
    """
    Registers startup/shutdown hooks on the FastAPI app.
    """
    settings = get_settings()
    fmt: Literal["console", "json"] = cast(Literal["console", "json"], settings.LOG_FORMAT)
    setup_logging(fmt=fmt)

    @app.on_event("startup")
    async def _on_startup() -> None:  # noqa: D401
        log.info("starting %s (env=%s)", settings.APP_NAME, settings.ENV)
        _startup_health()

    @app.on_event("shutdown")
    async def _on_shutdown() -> None:  # noqa: D401
        log.info("shutting down %s", settings.APP_NAME)
