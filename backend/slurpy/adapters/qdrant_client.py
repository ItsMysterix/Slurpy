from __future__ import annotations
from typing import Optional
import os

from qdrant_client import QdrantClient

__all__ = ["get_qdrant", "reset_qdrant"]

_client: Optional[QdrantClient] = None

def get_qdrant() -> QdrantClient:
    """
    Lazy singleton Qdrant client with proper typing.
    """
    global _client
    if _client is None:
        url = (os.getenv("QDRANT_URL") or "").strip()
        key = (os.getenv("QDRANT_API_KEY") or "").strip() or None
        if not url:
            raise RuntimeError("QDRANT_URL is not set")
        _client = QdrantClient(url=url, api_key=key)
    return _client

def reset_qdrant() -> None:
    """Reset the cached client (handy for tests or key rotation)."""
    global _client
    _client = None
