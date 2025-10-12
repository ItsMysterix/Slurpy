from .service import Patch, make_patch, build_context, maybe_build_context

# re-export router helpers
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
