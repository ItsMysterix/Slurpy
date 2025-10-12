# backend/slurpy/adapters/embedder.py
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Sequence

from functools import lru_cache

# Env knobs
_MODEL_NAME = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")
# "cpu", "cuda", "mps" (Apple), or leave empty to auto
_DEVICE = os.getenv("EMBED_DEVICE", "").strip() or None
# normalize L2? default True (recommended for cosine in Qdrant)
_NORMALIZE_DEFAULT = (os.getenv("EMBED_NORMALIZE", "true").lower() == "true")


@lru_cache(maxsize=1)
def _get_model():
    # Lazy import to keep cold start fast
    from sentence_transformers import SentenceTransformer

    # SentenceTransformer handles device automatically; you can also pass device at encode time
    model = SentenceTransformer(_MODEL_NAME)
    # Optional pre-move, mostly cosmetic; encode(..., device=...) also works
    if _DEVICE:
        try:
            model = model.to(_DEVICE)  # no-op if unsupported
        except Exception:
            # silently ignore; we'll still pass device at encode time
            pass
    return model


def _to_list(v) -> List[float]:
    # supports numpy arrays and torch tensors without importing them
    if hasattr(v, "tolist"):
        v = v.tolist()
    # now ensure plain python floats
    return [float(x) for x in v]


def embed(
    text: str,
    *,
    normalize: Optional[bool] = None,
) -> Optional[List[float]]:
    """
    Encode a single string to a dense vector (list[float]).
    - Set EMBED_MODEL / EMBED_DEVICE / EMBED_NORMALIZE via env.
    - Pass normalize=... to override env per call.
    """
    if not text:
        return None
    try:
        model = _get_model()
        norm = _NORMALIZE_DEFAULT if normalize is None else bool(normalize)
        kwargs: Dict[str, Any] = {
            "normalize_embeddings": norm,
            "convert_to_numpy": True,  # cheaper than converting torch→list manually
        }
        if _DEVICE:
            kwargs["device"] = _DEVICE
        vec = model.encode([text], **kwargs)[0]
        return _to_list(vec)
    except Exception as e:
        print(f"⚠️ Embedding failed: {e}")
        return None


def embed_batch(
    texts: Sequence[str],
    *,
    normalize: Optional[bool] = None,
) -> List[List[float]]:
    """
    Encode many strings at once; returns list[list[float]].
    Empty/None inputs are skipped as empty vectors.
    """
    if not texts:
        return []
    try:
        model = _get_model()
        norm = _NORMALIZE_DEFAULT if normalize is None else bool(normalize)
        if _DEVICE:
            vecs = model.encode(
                list(texts),
                normalize_embeddings=norm,
                convert_to_numpy=True,
                device=_DEVICE,
            )
        else:
            vecs = model.encode(
                list(texts),
                normalize_embeddings=norm,
                convert_to_numpy=True,
            )
        return [_to_list(v) for v in vecs]
    except Exception as e:
        print(f"⚠️ Batch embedding failed: {e}")
        # degrade gracefully: try per-item so a single bad string doesn't kill the batch
        out: List[List[float]] = []
        for t in texts:
            out.append(embed(t, normalize=normalize) or [])
        return out


def reset_embedder() -> None:
    """
    Drop the cached model (useful in tests or when switching EMBED_MODEL).
    """
    try:
        _get_model.cache_clear()  # type: ignore[attr-defined]
    except Exception:
        pass


def embedder_ready() -> bool:
    """
    Lightweight health check; returns False on failure (never raises).
    """
    try:
        v = embed("ping")
        return bool(v)
    except Exception:
        return False
