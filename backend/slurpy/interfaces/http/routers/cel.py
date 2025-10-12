from fastapi import APIRouter
from typing import Optional
from slurpy.domain.cel.service import make_patch  # your cel/patch.py re-exported from service

router = APIRouter()

@router.post("/patch")
def cel_patch(label: str, prob: float, persona: str = "therapist", text: Optional[str] = None):
    return make_patch(label, prob, text=text, persona=persona)  # if signature differs, adjust
