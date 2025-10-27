# backend/slurpy/interfaces/http/deps/auth.py
from __future__ import annotations

import os
from typing import Optional, Dict, Any, Annotated

from fastapi import Header, HTTPException
from slurpy.adapters.supabase_auth import verify_supabase_token, SupabaseAuthError

# NOTE: Put *no* default inside Header(); use alias to bind "Authorization".
# The default (None) lives on the function parameter.
AuthHeader = Annotated[Optional[str], Header(alias="Authorization")]

# Dev bypass flag (local-only). Do NOT enable in production!
DEV_BYPASS_AUTH = os.getenv("DEV_BYPASS_AUTH", "").lower() in {"1", "true", "yes"}


def _claims_to_user(claims: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize auth claims into a compact user dict the app expects.
    """
    return {"id": claims.get("sub"), "claims": claims}


def _extract_bearer(auth: Optional[str]) -> str:
    """
    Extract the bearer token from the Authorization header.
    Raises HTTP 401 on any format error.
    """
    if not auth:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = auth.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Expected 'Bearer <token>'")
    return parts[1]


def get_current_user(authorization: AuthHeader = None) -> Dict[str, Any]:
    """
    Strict auth dependency. In dev, can be bypassed with DEV_BYPASS_AUTH=1.
    """
    if DEV_BYPASS_AUTH:
        # Minimal synthetic user for local development
        return {"id": "dev-user", "claims": {"dev": True}}

    token = _extract_bearer(authorization)
    try:
        claims = verify_supabase_token(token)
    except SupabaseAuthError:
        # Keep errors terse; avoid leaking internals
        raise HTTPException(status_code=401, detail="Invalid token")
    return _claims_to_user(claims)


def get_optional_user(authorization: AuthHeader = None) -> Optional[Dict[str, Any]]:
    """
    Optional auth dependency. Returns None when:
      - No Authorization header is present, or
      - Token verification fails (do not error on public routes)
    In dev with DEV_BYPASS_AUTH=1, returns a synthetic user.
    """
    if DEV_BYPASS_AUTH:
        return {"id": "dev-user", "claims": {"dev": True}}

    if not authorization:
        return None
    try:
        token = _extract_bearer(authorization)
        claims = verify_supabase_token(token)
        return _claims_to_user(claims)
    except Exception:
        return None


__all__ = [
    "AuthHeader",
    "get_current_user",
    "get_optional_user",
    "DEV_BYPASS_AUTH",
]
