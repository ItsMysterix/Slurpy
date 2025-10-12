# backend/slurpy/adapters/clerk_client.py
from __future__ import annotations
import os, atexit, threading
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
import cachetools
from jose import jwt, JWTError

# --- Env / config ------------------------------------------------------------
JWKS_URL: str = (os.getenv("CLERK_JWKS_URL") or
                 "https://concrete-lark-31.clerk.accounts.dev/.well-known/jwks.json").strip()
ALGORITHM: str = (os.getenv("CLERK_JWT_ALG") or "RS256").strip()
CACHE_TTL: int = int(os.getenv("CLERK_JWKS_TTL", "3600"))
LEEWAY: int = int(os.getenv("CLERK_JWT_LEEWAY", "60"))
AUDIENCE: Optional[str] = (os.getenv("CLERK_AUDIENCE") or "").strip() or None

# Issuer allowlist
_allowed: List[str] = []
iss_env = os.getenv("CLERK_ISSUER")
if iss_env:
    _allowed.append(iss_env.rstrip("/"))
allowed_env = os.getenv("CLERK_ALLOWED_ISSUERS", "")
if allowed_env:
    _allowed += [i.strip().rstrip("/") for i in allowed_env.split(",") if i.strip()]
if not _allowed:
    host = urlparse(JWKS_URL).hostname
    if host:
        _allowed = [f"https://{host}"]
ALLOWED_ISSUERS: Tuple[str, ...] = tuple(_allowed)

# Enforce HTTPS for JWKS
_parsed = urlparse(JWKS_URL)
if _parsed.scheme != "https":
    raise RuntimeError("CLERK_JWKS_URL must be HTTPS")

# --- HTTP client (HTTP/2 + retry) -------------------------------------------
_http = httpx.Client(
    http2=True,
    timeout=httpx.Timeout(5.0, connect=5.0, read=5.0),
    headers={"accept": "application/json"},
)
atexit.register(lambda: _http.close())

# --- Cache + lock ------------------------------------------------------------
_JWKS_CACHE = cachetools.TTLCache(maxsize=1, ttl=CACHE_TTL)
_JWKS_LOCK = threading.Lock()

def _fetch_jwks_uncached() -> List[Dict[str, Any]]:
    try:
        r = _http.get(JWKS_URL)
        r.raise_for_status()
        keys = (r.json() or {}).get("keys") or []
        if not isinstance(keys, list) or not keys:
            raise JWTError("JWKS has no 'keys'")
        return keys
    except Exception as e:
        raise JWTError(f"Unable to fetch JWKS: {e}") from e

def _fetch_jwks_cached() -> List[Dict[str, Any]]:
    with _JWKS_LOCK:
        if "jwks" in _JWKS_CACHE:  # type: ignore[index]
            return _JWKS_CACHE["jwks"]  # type: ignore[index]
        keys = _fetch_jwks_uncached()
        _JWKS_CACHE["jwks"] = keys  # type: ignore[index]
        return keys

def _get_signing_key(kid: Optional[str]) -> Dict[str, Any]:
    if not kid:
        raise JWTError("Missing 'kid' in JWT header")

    # cached first
    for key in _fetch_jwks_cached():
        if key.get("kid") == kid:
            return key

    # refresh for rotation
    keys = _fetch_jwks_uncached()
    with _JWKS_LOCK:
        _JWKS_CACHE["jwks"] = keys  # type: ignore[index]
    for key in keys:
        if key.get("kid") == kid:
            return key

    raise JWTError(f"Signing key not found for kid={kid}")

# --- Public API --------------------------------------------------------------
def verify_clerk_token(token: str) -> Dict[str, Any]:
    """
    Validate a Clerk session JWT and return claims dict or raise JWTError.
    """
    try:
        headers: Dict[str, Any] = jwt.get_unverified_header(token)
        alg = str(headers.get("alg", "")).upper()
        if alg != ALGORITHM.upper():
            raise JWTError(f"Unexpected alg '{alg}', expected '{ALGORITHM}'")

        key = _get_signing_key(headers.get("kid"))

        options: Dict[str, Any] = {
            "verify_aud": bool(AUDIENCE),
            "leeway": LEEWAY,
        }

        claims: Dict[str, Any] = jwt.decode(
            token,
            key,                      # jose accepts JWK dict
            algorithms=[ALGORITHM],
            audience=AUDIENCE,        # ignored if verify_aud=False
            options=options,
        )

        iss = str(claims.get("iss", "")).rstrip("/")
        if ALLOWED_ISSUERS and iss not in ALLOWED_ISSUERS:
            raise JWTError(f"Issuer not allowed: {iss}")

        sub = claims.get("sub")
        if not sub:
            raise JWTError("Missing 'sub' in JWT claims")

        return claims

    except JWTError:
        # already normalized
        raise
    except Exception as e:
        # normalize everything else
        raise JWTError(f"Invalid Clerk JWT: {e}") from e
