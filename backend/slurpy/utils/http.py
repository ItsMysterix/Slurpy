from __future__ import annotations

import os
from typing import Any, Dict, Optional
import httpx

from .text import to_bool

__all__ = [
    "get_http_client",
    "json_ok",
    "json_error",
]

_client: Optional[httpx.Client] = None

def get_http_client() -> httpx.Client:
    """
    Lazy singleton httpx.Client with sane defaults.
    Honors:
      HTTP_TIMEOUT_S   (float, default 8.0)
      HTTP_VERIFY_TLS  (bool 1/0, default True)
      HTTP_PROXY       (URL, optional)
      HTTP_HEADERS_JSON (comma-sep 'K:V' pairs)
    """
    global _client
    if _client is not None:
        return _client

    timeout_s = float(os.getenv("HTTP_TIMEOUT_S", "8.0"))
    verify = to_bool(os.getenv("HTTP_VERIFY_TLS", "1"), True)
    proxies = os.getenv("HTTP_PROXY") or None

    headers: Dict[str, str] = {"accept": "application/json"}
    extra = os.getenv("HTTP_HEADERS_JSON") or ""
    # allow "X-Api-Key: abc, X-Client: slurpy"
    for part in [p.strip() for p in extra.split(",") if p.strip()]:
        if ":" in part:
            k, v = part.split(":", 1)
            headers[k.strip()] = v.strip()

    _client = httpx.Client(timeout=timeout_s, verify=verify, proxy=proxies, headers=headers)
    return _client

def json_ok(data: Any | None = None, **extra: Any) -> Dict[str, Any]:
    """Uniform success envelope for ad-hoc responses."""
    out: Dict[str, Any] = {"ok": True}
    if data is not None:
        out["data"] = data
    if extra:
        out.update(extra)
    return out

def json_error(detail: str, code: Optional[str] = None, **meta: Any) -> Dict[str, Any]:
    """Uniform error envelope (still JSON-serializable)."""
    out: Dict[str, Any] = {"ok": False, "detail": detail}
    if code:
        out["code"] = code
    if meta:
        out["meta"] = meta
    return out
