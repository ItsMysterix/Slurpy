from __future__ import annotations

from .mcp_server import run as run_worker  # re-export a simple entrypoint

__all__ = ["run_worker"]
