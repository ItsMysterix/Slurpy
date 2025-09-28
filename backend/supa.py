# backend/supa.py
from __future__ import annotations

import os
import threading
from typing import Optional, Any

# supabase-py v2.x
from supabase import Client, create_client

# Optional features (present in newer supabase-py). If missing, we degrade gracefully.
try:  # type: ignore
    from supabase.lib.client_options import SyncClientOptions as ClientOptions  # supabase>=2.6
except Exception:  # pragma: no cover
    ClientOptions = None  # type: ignore


__all__ = ["supa", "supa_readonly", "supa_reset", "supa_ping"]

# --- singletons + locks -------------------------------------------------------
_client_lock = threading.Lock()
_client: Optional[Client] = None

_ro_client_lock = threading.Lock()
_ro_client: Optional[Client] = None


def _build_client(url: str, key: str, *, timeout_s: float, schema: str | None, extra_headers: dict[str, str]) -> Client:
    """
    Build a Supabase Client with optional timeouts/headers when supported by the SDK.
    Falls back to defaults if ClientOptions is unavailable in the installed version.
    """
    headers = {
        "X-Client-Info": os.getenv("SUPABASE_CLIENT_INFO", "slurpy-backend"),
        **extra_headers,
    }
    if ClientOptions is not None:
        # Newer SDK supports per-subclient timeouts; we set a sane default.
        opts = ClientOptions(
            postgrest_client_timeout=timeout_s,
            storage_client_timeout=timeout_s,
            # realtime opts exist but we don’t use realtime here
            headers=headers,
            schema=schema or "public",
        )
        return create_client(url, key, options=opts)
    # Older SDK path: options not available; still returns a working client.
    return create_client(url, key)


def _env_url_and_key(*, readonly: bool) -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL") or ""
    key = ""
    if readonly:
        key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY") or ""
    else:
        key = os.getenv("SUPABASE_SERVICE_ROLE") or os.getenv("SUPABASE_KEY") or ""
    if not url or not key:
        kind = "SUPABASE_URL/SERVICE_ROLE" if not readonly else "SUPABASE_URL/ANON_KEY"
        raise RuntimeError(f"Missing required Supabase env vars for {('read-only' if readonly else 'service')} client ({kind})")
    return url, key


def supa() -> Client:
    """
    Thread-safe singleton Supabase client using service-role key (server-side writes).
    Keeps the original API used across the codebase.
    """
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is None:
            url, key = _env_url_and_key(readonly=False)
            timeout_s = float(os.getenv("SUPABASE_TIMEOUT_S", "15"))
            schema = os.getenv("SUPABASE_SCHEMA") or "public"
            extra_headers = {}
            # You can route through a proxy/gateway by adding headers here via env if needed
            _client = _build_client(url, key, timeout_s=timeout_s, schema=schema, extra_headers=extra_headers)
    return _client


def supa_readonly() -> Client:
    """
    Optional read-only singleton using the anon key.
    Useful for health checks or non-privileged reads in utilities.
    """
    global _ro_client
    if _ro_client is not None:
        return _ro_client
    with _ro_client_lock:
        if _ro_client is None:
            url, key = _env_url_and_key(readonly=True)
            timeout_s = float(os.getenv("SUPABASE_TIMEOUT_S", "15"))
            schema = os.getenv("SUPABASE_SCHEMA") or "public"
            _ro_client = _build_client(url, key, timeout_s=timeout_s, schema=schema, extra_headers={})
    return _ro_client


def supa_reset() -> None:
    """
    Reset cached clients (handy for tests or when rotating keys at runtime).
    """
    global _client, _ro_client
    with _client_lock:
        _client = None
    with _ro_client_lock:
        _ro_client = None


def supa_ping(readonly: bool = True) -> bool:
    """
    Lightweight health check. Attempts a trivial select on an always-present table
    (pg_catalog.pg_tables via rpc is overkill; we default to a tiny NOOP).
    Falls back to building a client only.
    """
    try:
        client = supa_readonly() if readonly else supa()
        # Minimal “does it talk” check: list any table with limit 0.
        # We pick a table name that probably exists in your schema; if not,
        # the request still exercises auth + network and will return 200/406.
        # Using .table("chat_sessions") is fine; analytics will create it eventually.
        try_table = os.getenv("SUPABASE_PING_TABLE", "chat_sessions")
        # We don't care if it 404s; successful HTTP round-trip is sufficient.
        client.table(try_table).select("*").limit(0).execute()
        return True
    except Exception:
        return False
