"""
Minimal Clerk JWT verifier with in‑memory JWKS cache
"""

import os, time, httpx, cachetools
from jose import jwt, JWTError

JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    "https://concrete-lark-31.clerk.accounts.dev/.well-known/jwks.json",       
)
_ALG = "RS256"
_CACHE_TTL = 60 * 60            # 1 h

@cachetools.cached(cachetools.TTLCache(maxsize=1, ttl=_CACHE_TTL))
def _fetch_jwks():
    """Download Clerk’s JWKS once per hour (no auth header!)."""
    resp = httpx.get(JWKS_URL, timeout=5.0)
    resp.raise_for_status()
    return resp.json()["keys"]

def _get_signing_key(kid: str):
    for key in _fetch_jwks():
        if key["kid"] == kid:
            return key
    raise ValueError(f"Signing key {kid} not found in Clerk JWKS")

def verify_clerk_token(token: str) -> dict:
    """Return the token’s claims or raise 401‐style JWTError."""
    try:
        headers = jwt.get_unverified_header(token)
        key = _get_signing_key(headers["kid"])
        return jwt.decode(token, key, algorithms=[_ALG], options={"verify_aud": False})
    except JWTError as e:
        raise JWTError(f"Invalid Clerk JWT: {e}") from e
