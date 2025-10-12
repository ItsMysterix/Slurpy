from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, Field

class RAGHit(BaseModel):
    score: float = 0.0
    text: str = ""
    title: Optional[str] = None
    url: Optional[str] = None
    dataset_id: Optional[str] = None
    doc_id: Optional[str] = None
    chunk_idx: Optional[int] = None

class RAGSearchResponse(BaseModel):
    hits: List[RAGHit] = []

# if you ever switch to POST with body:
class RAGSearchRequest(BaseModel):
    q: str = Field(..., description="Query text")
    k: Optional[int] = None
    dataset_id: Optional[str] = None
