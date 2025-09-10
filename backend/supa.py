# backend/supa.py
from __future__ import annotations
import os
from typing import Optional
from supabase import Client, create_client


_client: Optional[Client] = None

def supa() -> Client:
    """Singleton Supabase client using service role key (server-side only)."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE") or os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE")
        _client = create_client(url, key)
    return _client
