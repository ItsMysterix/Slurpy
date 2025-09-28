# backend/search_api.py (adapt your existing route)
import os, math
from fastapi import APIRouter, Query
from typing import Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm
from sentence_transformers import SentenceTransformer

router = APIRouter()

DEFAULT_K = int(os.getenv("TOP_K", 4))
MODEL = os.getenv("EMB_MODEL", "intfloat/e5-small-v2")
COLL  = os.getenv("QDRANT_COLLECTION", "slurpy_chunks")
QURL  = os.getenv("QDRANT_URL")
QKEY  = os.getenv("QDRANT_API_KEY")

_emb, _q = None, None
def emb():
  global _emb; _emb = _emb or SentenceTransformer(MODEL); return _emb
def qdrant():
  global _q; _q = _q or QdrantClient(url=QURL, api_key=QKEY); return _q

def enc(q: str):
  m = MODEL.lower()
  if "e5" in m or "bge" in m: return emb().encode(f"query: {q}", normalize_embeddings=True).tolist()
  return emb().encode(q, normalize_embeddings=True).tolist()

def pick_k_by_budget(query: str, avg_chunk_tokens=180, max_ctx_tokens=1200) -> int:
  # rough token estimate: 4 chars ≈ 1 token
  q_tokens = max(1, len(query) // 4)
  budget = max_ctx_tokens - min(q_tokens, 200)
  return max(3, min(12, math.floor(budget / avg_chunk_tokens)))

def pick_k_by_scores(scores, hard_cap=12, min_keep=3, gap_drop=0.08):
  """
  elbow-ish rule: keep until score drops sharply.
  scores: descending list from the ANN result (higher is closer)
  """
  if not scores: return min_keep
  k = min(len(scores), hard_cap)
  best = scores[0]
  for i in range(1, k):
    # relative drop from best
    if (best - scores[i]) > gap_drop:
      return max(min_keep, i)
  return max(min_keep, k)

@router.get("/search")
def search(q: str, k: Optional[int] = Query(None), dataset_id: Optional[str] = None):
  vec = enc(q)
  flt = qm.Filter(must=[qm.FieldCondition(key="dataset_id", match=qm.MatchValue(value=dataset_id))]) if dataset_id else None

  # first ask for an upper bound, then prune
  upper_k = k or max(pick_k_by_budget(q), DEFAULT_K)  # budget-based
  upper_k = min(upper_k, 20)  # safety

  res = qdrant().query_points(
    collection_name=COLL,
    query=vec,
    limit=upper_k,
    with_payload=True,
    query_filter=flt,
  )

  points = res.points or []
  # score-based elbow to get volatile k
  if k is None:
    scores = [p.score or 0.0 for p in points]
    kept = pick_k_by_scores(scores, hard_cap=upper_k)
    points = points[:kept]

  hits = [{
      "score": p.score or 0.0,
      "text": (p.payload or {}).get("text") or (p.payload or {}).get("source",""),
      "title": (p.payload or {}).get("title"),
      "url": (p.payload or {}).get("url"),
      "dataset_id": (p.payload or {}).get("dataset_id"),
      "doc_id": (p.payload or {}).get("doc_id"),
      "chunk_idx": (p.payload or {}).get("chunk_idx"),
  } for p in points]

  return {"hits": hits}
