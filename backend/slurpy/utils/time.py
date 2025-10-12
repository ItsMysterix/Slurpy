from __future__ import annotations

import time as _time
from datetime import datetime, timezone, timedelta
from typing import Optional

__all__ = [
    "utc_now",
    "utc_iso",
    "parse_iso",
    "since",
    "monotonic_ms",
]

def utc_now() -> datetime:
    """Timezone-aware UTC now."""
    return datetime.now(timezone.utc)

def utc_iso(dt: Optional[datetime] = None) -> str:
    """RFC3339 / ISO8601 with trailing Z."""
    dt = dt or utc_now()
    return dt.isoformat().replace("+00:00", "Z")

def parse_iso(s: str) -> Optional[datetime]:
    """Parse ISO string to aware datetime (UTC). Returns None on failure."""
    if not s:
        return None
    try:
        # support both Z and +00:00
        s = s.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        # normalize to UTC and ensure tz-aware
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except Exception:
        return None

def since(dt: datetime) -> timedelta:
    """Timedelta from dt → now (UTC). If dt naive, assume UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return utc_now() - dt

def monotonic_ms() -> int:
    """Monotonic clock in milliseconds (good for profiling)."""
    return int(_time.monotonic() * 1000)
