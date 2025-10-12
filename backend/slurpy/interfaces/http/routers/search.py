from fastapi import APIRouter, Query
from typing import Optional
from slurpy.adapters.search_api_client import search as _search  # your adapter fn

router = APIRouter()

@router.get("")
def search(q: str, k: Optional[int] = Query(None), dataset_id: Optional[str] = None):
    return _search(q=q, k=k, dataset_id=dataset_id)
