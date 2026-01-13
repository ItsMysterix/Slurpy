from __future__ import annotations

import os
import math
import time
from typing import Any, Dict, List, Optional, Sequence

# --- adapters (embedder + qdrant + cache) ---
try:
    from slurpy.adapters.embedder import embed as _embed  # -> Optional[List[float]]
except Exception:
    _embed = None  # type: ignore

try:
    from slurpy.adapters.cache import get_cache
except Exception:
    get_cache = None  # type: ignore

# Keep type-checkers happy even if we define a raising fallback.
from typing import TYPE_CHECKING, Any, cast
if TYPE_CHECKING:
    from qdrant_client import QdrantClient as _QdrantClient  # only for typing

try:
    from qdrant_client import models as qm
except Exception:
    qm = None  # type: ignore

try:
    from slurpy.adapters.qdrant_client import get_qdrant as _get_qdrant
except Exception:
    def _get_qdrant() -> "_QdrantClient":  # type: ignore[name-defined]
        raise RuntimeError("slurpy.adapters.qdrant_client.get_qdrant not available")

def get_qdrant() -> "_QdrantClient":  # type: ignore[name-defined]
    # At runtime this is the real function; the cast just quiets the checker.
    return cast("_QdrantClient", _get_qdrant())

# --- config ---
DEFAULT_K = int(os.getenv("TOP_K", "4"))
MODEL = os.getenv("EMBED_MODEL", os.getenv("EMB_MODEL", "intfloat/e5-small-v2"))
DEFAULT_COLLECTION = os.getenv("QDRANT_COLLECTION", "slurpy_chunks")


# --- helpers ---
def _encode_query(q: str) -> List[float]:
    """
    Encode a query with E5/BGE prefixing if needed and force python floats.
    """
    if _embed is None:
        raise RuntimeError("Embedder adapter not available")

    model = (MODEL or "").lower()
    text = f"query: {q}" if ("e5" in model or "bge" in model) else q

    vec = _embed(text)
    if not vec:
        raise RuntimeError("Embedding failed or returned empty vector")

    return [float(x) for x in vec]


def pick_k_by_budget(query: str, avg_chunk_tokens: int = 180, max_ctx_tokens: int = 1200) -> int:
    # rough token estimate: 4 chars ≈ 1 token
    q_tokens = max(1, len(query) // 4)
    budget = max_ctx_tokens - min(q_tokens, 200)
    return max(3, min(12, math.floor(budget / avg_chunk_tokens)))


def pick_k_by_scores(scores: Sequence[float], hard_cap: int = 12, min_keep: int = 3, gap_drop: float = 0.08) -> int:
    """
    Elbow-ish rule: keep until relative drop from the best exceeds gap_drop.
    """
    if not scores:
        return min_keep
    k = min(len(scores), hard_cap)
    best = float(scores[0])
    for i in range(1, k):
        if (best - float(scores[i])) > gap_drop:
            return max(min_keep, i)
    return max(min_keep, k)


# --- main API ---
def search(
    q: str,
    *,
    k: Optional[int] = None,
    dataset_id: Optional[str] = None,
    collection: Optional[str] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Query Qdrant and return:
        {"hits": [{score, text, title, url, dataset_id, doc_id, chunk_idx}, ...], "cached": bool, "latency_ms": float}
    If k is None, use a budget-based upper bound and trim via score elbow.
    Includes caching for faster repeated queries.
    """
    start_time = time.time()
    
    # Try cache first
    cache_key = f"{q}:{k}:{dataset_id}:{collection}"
    if use_cache and get_cache:
        cache = get_cache()
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            cached_result["cached"] = True
            cached_result["latency_ms"] = (time.time() - start_time) * 1000
            return cached_result
    
    vec = _encode_query(q)

    flt = None
    if dataset_id:
        if qm is None:
            raise RuntimeError("qdrant_client.models not available")
        flt = qm.Filter(
            must=[qm.FieldCondition(key="dataset_id", match=qm.MatchValue(value=dataset_id))]
        )

    upper_k = k or max(pick_k_by_budget(q), DEFAULT_K)
    upper_k = min(int(upper_k), 20)

    client = get_qdrant()
    res = client.query_points(
        collection_name=collection or DEFAULT_COLLECTION,
        query=vec,
        limit=upper_k,
        with_payload=True,
        query_filter=flt,
    )

    points = list(res.points or [])

    # elbow if caller didn't force k
    if k is None:
        scores = [float(p.score or 0.0) for p in points]
        keep_n = pick_k_by_scores(scores, hard_cap=upper_k)
        points = points[:keep_n]

    hits: List[Dict[str, Any]] = []
    for p in points:
        payload = p.payload or {}
        hits.append(
            {
                "score": float(p.score or 0.0),
                "text": payload.get("text") or payload.get("source", ""),
                "title": payload.get("title"),
                "url": payload.get("url"),
                "dataset_id": payload.get("dataset_id"),
                "doc_id": payload.get("doc_id"),
                "chunk_idx": payload.get("chunk_idx"),
            }
        )

    result = {"hits": hits, "cached": False, "latency_ms": (time.time() - start_time) * 1000}
    
    # Cache the result
    if use_cache and get_cache:
        cache = get_cache()
        cache.set(cache_key, result)
    
    return result
