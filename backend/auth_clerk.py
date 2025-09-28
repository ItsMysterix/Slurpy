# -*- coding: utf-8 -*-
"""
auth_clerk.py — Minimal Clerk JWT verifier (prod-hardened)

- Caches JWKS with TTL, refreshes on kid-miss (key rotation)
- Verifies alg, exp/nbf/iat with configurable leeway
- Optional audience validation
- Issuer allowlist via env
- Normalizes all failures to JWTError (so API can 401)
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from jose import jwt, JWTError
import cachetools

# ── Env config ────────────────────────────────────────────────────────────────
JWKS_URL: str = os.getenv(
    "CLERK_JWKS_URL",
    "https://concrete-lark-31.clerk.accounts.dev/.well-known/jwks.json",
).strip()

ALGORITHM: str = os.getenv("CLERK_JWT_ALG", "RS256").strip()
CACHE_TTL: int = int(os.getenv("CLERK_JWKS_TTL", "3600"))      # seconds
LEEWAY: int    = int(os.getenv("CLERK_JWT_LEEWAY", "60"))      # seconds of clock skew

# Audience (optional); if unset, we skip aud verification
AUDIENCE: Optional[str] = (os.getenv("CLERK_AUDIENCE") or "").strip() or None

# Issuer allowlist
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
    host = urlparse(JWKS_URL).hostname
    if host:
        _allowed = [f"https://{host}"]
ALLOWED_ISSUERS: Tuple[str, ...] = tuple(_allowed)

# ── HTTP client (module-scope, reused) ────────────────────────────────────────
_http = httpx.Client(timeout=5.0, headers={"accept": "application/json"})

# ── JWKS cache with TTL ───────────────────────────────────────────────────────
_JWKS_CACHE = cachetools.TTLCache(maxsize=1, ttl=CACHE_TTL)

def _fetch_jwks_uncached() -> List[Dict[str, Any]]:
    """Fetch JWKS from Clerk without using the TTL cache."""
    try:
        resp = _http.get(JWKS_URL)
        resp.raise_for_status()
        data = resp.json()
        keys = data.get("keys") or []
        if not isinstance(keys, list) or not keys:
            raise JWTError("JWKS has no 'keys'")
        return keys
    except Exception as e:
        raise JWTError(f"Unable to fetch JWKS: {e}") from e

def _fetch_jwks_cached() -> List[Dict[str, Any]]:
    """Fetch JWKS using TTL cache (and populate it if empty)."""
    try:
        if "jwks" in _JWKS_CACHE:
            return _JWKS_CACHE["jwks"]  # type: ignore[index]
        keys = _fetch_jwks_uncached()
        _JWKS_CACHE["jwks"] = keys  # type: ignore[index]
        return keys
    except Exception as e:
        raise JWTError(str(e)) from e

def _get_signing_key(kid: Optional[str]) -> Dict[str, Any]:
    """
    Return the JWK for the given kid.
    If not found in cached JWKS, force-refresh once to handle key rotation.
    """
    if not kid:
        raise JWTError("Missing 'kid' in JWT header")

    # 1) Try cached keys
    keys = _fetch_jwks_cached()
    for key in keys:
        if key.get("kid") == kid:
            return key

    # 2) Force refresh (key rotation)
    try:
        keys = _fetch_jwks_uncached()
        _JWKS_CACHE["jwks"] = keys  # refresh cache
        for key in keys:
            if key.get("kid") == kid:
                return key
    except JWTError:
        pass

    raise JWTError(f"Signing key not found for kid={kid}")

# ── Public API ────────────────────────────────────────────────────────────────
def verify_clerk_token(token: str) -> Dict[str, Any]:
    """
    Validate a Clerk session JWT and return claims.
    Raises JWTError on any failure (so FastAPI can respond 401).
    """
    try:
        # Header checks
        headers: Dict[str, Any] = jwt.get_unverified_header(token)
        kid = headers.get("kid")
        alg = str(headers.get("alg", "")).upper()
        if alg != ALGORITHM.upper():
            raise JWTError(f"Unexpected alg '{alg}', expected '{ALGORITHM}'")

        key = _get_signing_key(kid)

        # Options: toggle audience verification only if AUDIENCE provided.
        options: Dict[str, Any] = {
            "verify_aud": bool(AUDIENCE),
            "leeway": LEEWAY,
            # other defaults (exp/nbf/iat) are verified by default in python-jose
        }

        # Decode & validate
        claims: Dict[str, Any] = jwt.decode(
            token,
            key,                       # python-jose accepts a JWK dict
            algorithms=[ALGORITHM],
            audience=AUDIENCE,         # None → ignored when verify_aud=False
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
