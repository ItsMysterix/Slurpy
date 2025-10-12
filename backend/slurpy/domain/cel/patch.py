# -*- coding: utf-8 -*-
"""
Thin shim so older imports like `from slurpy.domain.cel.patch import make_patch`
keep working. All logic lives in service.py.
"""

from __future__ import annotations

from .service import (
    Patch,
    make_patch,
    build_context,
    maybe_build_context,
)

# (optional) expose the LLM router symbol here for convenience
try:
    from .llm_router import llm_semantic_emotion, TOOL_HINT  # noqa: F401
except Exception:  # pragma: no cover
    llm_semantic_emotion = None  # type: ignore
    TOOL_HINT = None  # type: ignore

__all__ = [
    "Patch",
    "make_patch",
    "build_context",
    "maybe_build_context",
    "llm_semantic_emotion",
    "TOOL_HINT",
]
