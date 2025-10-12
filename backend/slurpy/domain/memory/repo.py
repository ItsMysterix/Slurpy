# backend/slurpy/domain/memory/repo.py
from __future__ import annotations
from typing import Any, Dict, List, Optional

import os
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

try:
    # optional: use your adapter to share one client instance
    from slurpy.adapters.qdrant_client import get_qdrant  # type: ignore
except Exception:
    get_qdrant = None  # type: ignore


class MemoryRepo:
    def __init__(self, collection: Optional[str] = None):
        self.collection = collection or os.getenv("MEMORY_COLLECTION", "user_memory_v2")
        self.client: QdrantClient = get_qdrant() if callable(get_qdrant) else QdrantClient(
            url=os.getenv("QDRANT_URL", "http://localhost:6333"),
            api_key=os.getenv("QDRANT_API_KEY"),
        )

    # ---- setup / info ----
    def ensure_collection(self, embedding_dim: int) -> None:
        names = [c.name for c in self.client.get_collections().collections]
        if self.collection not in names:
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=qm.VectorParams(size=embedding_dim, distance=qm.Distance.COSINE),
            )

    def ensure_user_index(self) -> None:
        try:
            self.client.create_payload_index(
                collection_name=self.collection,
                field_name="user_id",
                field_schema=qm.PayloadSchemaType.KEYWORD,
            )
        except Exception:
            pass  # already exists or not supported on this tier

    def collection_points_count(self) -> Optional[int]:
        try:
            info = self.client.get_collection(self.collection)
            return getattr(info, "points_count", None)
        except Exception:
            return None

    # ---- mutations ----
    def upsert_point(self, point_id: str, vector: List[float], payload: Dict[str, Any]) -> None:
        self.client.upsert(
            collection_name=self.collection,
            points=[qm.PointStruct(id=point_id, vector=vector, payload=payload)],
        )

    # ---- queries ----
    def search_filtered(
        self, vector: List[float], user_id: str, limit: int, score_threshold: Optional[float] = 0.3
    ):
        kwargs: Dict[str, Any] = dict(
            collection_name=self.collection,
            query_vector=vector,
            query_filter=qm.Filter(must=[qm.FieldCondition(key="user_id", match=qm.MatchValue(value=user_id))]),
            limit=limit,
            with_payload=True,
        )
        if score_threshold is not None:
            kwargs["score_threshold"] = score_threshold
        try:
            return self.client.search(**kwargs)
        except TypeError:
            # older clients don’t support score_threshold
            kwargs.pop("score_threshold", None)
            return self.client.search(**kwargs)

    def search_global(self, vector: List[float], limit: int):
        return self.client.search(
            collection_name=self.collection, query_vector=vector, limit=limit, with_payload=True
        )

    def scroll_user(self, user_id: str, limit: int):
        points, next_offset = self.client.scroll(
            collection_name=self.collection,
            scroll_filter=qm.Filter(must=[qm.FieldCondition(key="user_id", match=qm.MatchValue(value=user_id))]),
            limit=limit,
            with_payload=True,
        )
        return points, next_offset
