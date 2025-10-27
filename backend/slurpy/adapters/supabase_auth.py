from __future__ import annotations

import os
from typing import Any, Dict

import httpx


class SupabaseAuthError(Exception):
    pass


def verify_supabase_token(token: str) -> Dict[str, Any]:
    """
    Verify a Supabase (GoTrue) access token by calling the user endpoint.

    This does not require server secrets. It uses the project's public `apikey`
    (anon key) and the bearer user token to retrieve the user. If valid, returns
    a dict including at least {"sub": <user_id>}.
    """
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    anon = os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not anon:
        raise SupabaseAuthError("Missing SUPABASE_URL or SUPABASE_ANON_KEY")

    user_endpoint = f"{url}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": anon,
        "accept": "application/json",
    }

    try:
        with httpx.Client(timeout=httpx.Timeout(5.0, connect=5.0, read=5.0)) as client:
            resp = client.get(user_endpoint, headers=headers)
            if resp.status_code != 200:
                raise SupabaseAuthError("Invalid token")
            data = resp.json() or {}
            # Normalize to include a 'sub' like claim for consistency
            user_id = data.get("id") or data.get("sub")
            if not user_id:
                raise SupabaseAuthError("Token verified but user id missing")
            data.setdefault("sub", user_id)
            return data
    except SupabaseAuthError:
        raise
    except Exception as e:
        raise SupabaseAuthError(f"Auth verification failed: {e}") from e
