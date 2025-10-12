from __future__ import annotations
from typing import Sequence

def pick_k_by_scores(scores: Sequence[float], hard_cap: int = 12, min_keep: int = 3, gap_drop: float = 0.08) -> int:
    """
    Elbow selector used by retriever. Exposed separately in case you want
    to reuse for hybrid reranking or client-side trimming.
    """
    if not scores:
        return min_keep
    k = min(len(scores), hard_cap)
    best = float(scores[0])
    for i in range(1, k):
        if (best - float(scores[i])) > gap_drop:
            return max(min_keep, i)
    return max(min_keep, k)
