from __future__ import annotations
from fastapi import APIRouter

from slurpy.adapters.supabase_client import supa_ping
from slurpy.adapters.qdrant_client import get_qdrant

router = APIRouter()

@router.get("/healthz")
def healthz():
    ok_db = supa_ping(readonly=True)
    try:
        qc = get_qdrant()
        qc.get_collections()  # simple round-trip
        ok_vec = True
    except Exception:
        ok_vec = False
    return {"ok": ok_db and ok_vec, "supabase": ok_db, "qdrant": ok_vec}
