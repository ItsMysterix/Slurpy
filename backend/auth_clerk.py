# backend/auth_clerk.py
# -*- coding: utf-8 -*-
"""
Minimal Clerk JWT verifier with in-memory JWKS cache (hardened)
- Caches JWKS
- Verifies exp/nbf/iat; optional audience
- Verifies issuer against allowlist (env)
- Normalizes all failures to JWTError (so API can 401)
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple
import httpx
import cachetools
from jose import jwt, JWTError
from urllib.parse import urlparse

# ── Config via env ────────────────────────────────────────────────────────────
JWKS_URL: str = os.getenv(
    "CLERK_JWKS_URL",
    "https://concrete-lark-31.clerk.accounts.dev/.well-known/jwks.json",
).strip()

ALGORITHM: str = os.getenv("CLERK_JWT_ALG", "RS256").strip()
CACHE_TTL: int = int(os.getenv("CLERK_JWKS_TTL", "3600"))      # seconds
LEEWAY: int    = int(os.getenv("CLERK_JWT_LEEWAY", "60"))      # seconds of clock skew

# Audience validation (optional). If unset → skip audience check.
AUDIENCE: Optional[str] = (os.getenv("CLERK_AUDIENCE") or "").strip() or None

# Issuer allowlist:
_allowed: List[str] = []
if os.getenv("CLERK_ISSUER"):
    _allowed.append(os.getenv("CLERK_ISSUER").rstrip("/"))  # type: ignore[arg-type]
if os.getenv("CLERK_ALLOWED_ISSUERS"):
    _allowed += [
        i.strip().rstrip("/")
        for i in os.getenv("CLERK_ALLOWED_ISSUERS", "").split(",")
        if i.strip()
    ]
if not _allowed:
    # Infer from JWKS host as a sensible default
    host = urlparse(JWKS_URL).hostname
    if host:
        _allowed = [f"https://{host}"]

ALLOWED_ISSUERS: Tuple[str, ...] = tuple(_allowed)

_http = httpx.Client(timeout=5.0, headers={"accept": "application/json"})

@cachetools.cached(cachetools.TTLCache(maxsize=1, ttl=CACHE_TTL))
def _fetch_jwks() -> List[Dict[str, Any]]:
    """Download Clerk’s JWKS (cached)."""
    try:
        resp = _http.get(JWKS_URL)
        resp.raise_for_status()
        data = resp.json()
        keys = data.get("keys") or []
        if not isinstance(keys, list) or not keys:
            raise JWTError("JWKS has no 'keys'")
        return keys
    except Exception as e:
        # Normalize all fetch issues to JWTError so callers can 401
        raise JWTError(f"Unable to fetch JWKS: {e}") from e

def _get_signing_key(kid: Optional[str]) -> Dict[str, Any]:
    """Return JWK for given kid or raise JWTError."""
    if not kid:
        raise JWTError("Missing 'kid' in JWT header")
    for key in _fetch_jwks():
        if key.get("kid") == kid:
            return key
    raise JWTError(f"Signing key not found for kid={kid}")

def verify_clerk_token(token: str) -> Dict[str, Any]:
    """
    Validate a Clerk session JWT and return claims.
    Raises JWTError on any failure (so FastAPI can respond 401).
    """
    try:
        headers: Dict[str, Any] = jwt.get_unverified_header(token)
        key = _get_signing_key(headers.get("kid"))

        # Audience rules:
        #  - If AUDIENCE provided → verify_aud True and pass audience
        #  - If not provided     → skip audience verification
        options: Dict[str, Any] = {
            "verify_aud": bool(AUDIENCE),
            # Pass leeway via options to satisfy type stubs that reject leeway kwarg
            "leeway": LEEWAY,
        }

        claims: Dict[str, Any] = jwt.decode(
            token,
            key,                                 # python-jose accepts a JWK dict
            algorithms=[ALGORITHM],
            audience=AUDIENCE,                   # None if not set → ignored
            options=options,
        )

        # Issuer allowlist
        iss = str(claims.get("iss", "")).rstrip("/")
        if ALLOWED_ISSUERS and iss not in ALLOWED_ISSUERS:
            raise JWTError(f"Issuer not allowed: {iss}")

        if not claims.get("sub"):
            raise JWTError("Missing 'sub' in JWT claims")

        return claims

    except JWTError:
        # Already normalized
        raise
    except Exception as e:
        # Anything else → normalize to JWTError
        raise JWTError(f"Invalid Clerk JWT: {e}") from e
