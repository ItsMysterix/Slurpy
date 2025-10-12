# backend/slurpy/modes.py
from __future__ import annotations

from .. import modes as _m

MODES = _m.MODES
DEFAULT_MODE = _m.DEFAULT_MODE
available = _m.available
config = _m.config
get_ids = _m.get_ids
is_valid = _m.is_valid
get_default = _m.get_default

__all__ = [
    "MODES", "DEFAULT_MODE", "available", "config",
    "get_ids", "is_valid", "get_default",
]
