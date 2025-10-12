# backend/slurpy/adapters/search_api_client.py
from __future__ import annotations

import os
import math
from typing import Any, Dict, List, Optional

from qdrant_client.http import models as qm

from slurpy.adapters.qdrant_client import get_qdrant
from slurpy.adapters.embedder import embed  # uses EMBED_MODEL / EMBED_DEVICE / EMBED_NORMALIZE

DEFAULT_K = int(os.getenv("TOP_K", "4"))
MODEL = os.getenv("EMBED_MODEL", "intfloat/e5-small-v2")
COLL = os.getenv("QDRANT_COLLECTION", "slurpy_chunks")


def _is_e5_or_bge(model_name: str) -> bool:
    m = (model_name or "").lower()
    return "e5" in m or "bge" in m


def _encode_query(q: str) -> List[float]:
    """
    Encode a query to a dense vector (list[float]).
    Adds 'query: ' prefix for E5/BGE families (best practice).
    """
    text = f"query: {q}" if _is_e5_or_bge(MODEL) else q
    vec = embed(text) or []
    # ensure primitive floats
    return [float(x) for x in vec]


def _pick_k_by_budget(query: str, avg_chunk_tokens: int = 180, max_ctx_tokens: int = 1200) -> int:
    # rough estimate: 4 chars ≈ 1 token
    q_tokens = max(1, len(query) // 4)
    budget = max_ctx_tokens - min(q_tokens, 200)
    return max(3, min(12, math.floor(budget / avg_chunk_tokens)))


def _pick_k_by_scores(scores: List[float], *, hard_cap: int = 12, min_keep: int = 3, gap_drop: float = 0.08) -> int:
    """
    Elbow-ish rule: keep until score drops sharply relative to the best.
    """
    if not scores:
        return min_keep
    k = min(len(scores), hard_cap)
    best = scores[0]
    for i in range(1, k):
        if (best - scores[i]) > gap_drop:
            return max(min_keep, i)
    return max(min_keep, k)


def search(
    q: str,
    *,
    k: Optional[int] = None,
    dataset_id: Optional[str] = None,
    collection: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Perform a semantic search over Qdrant.

    Returns:
        {"hits": [{"score": float, "text": str, "title": str|None, "url": str|None,
                   "dataset_id": str|None, "doc_id": str|None, "chunk_idx": int|None}, ...]}
    """
    if not q:
        return {"hits": []}

    vec = _encode_query(q)
    if not vec:
        # embedder unavailable → no results
        return {"hits": []}

    flt = None
    if dataset_id:
        flt = qm.Filter(must=[qm.FieldCondition(key="dataset_id", match=qm.MatchValue(value=dataset_id))])

    # first ask for an upper bound, then prune adaptively
    upper_k = k or max(_pick_k_by_budget(q), DEFAULT_K)
    upper_k = min(upper_k, 20)  # safety guardrails

    cli = get_qdrant()
    res = cli.query_points(
        collection_name=collection or COLL,
        query=vec,
        limit=upper_k,
        with_payload=True,
        query_filter=flt,
    )

    points = list(res.points or [])
    if k is None:
        scores = [float(p.score or 0.0) for p in points]
        kept = _pick_k_by_scores(scores, hard_cap=upper_k)
        points = points[:kept]

    hits = []
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

    return {"hits": hits}


class SearchClient:
    """
    Optional OO wrapper if you prefer DI:
        sc = SearchClient(collection="slurpy_chunks")
        sc.search("how to frobnicate", k=6)
    """

    def __init__(self, collection: Optional[str] = None):
        self.collection = collection or COLL

    def search(self, q: str, *, k: Optional[int] = None, dataset_id: Optional[str] = None) -> Dict[str, Any]:
        return search(q, k=k, dataset_id=dataset_id, collection=self.collection)
