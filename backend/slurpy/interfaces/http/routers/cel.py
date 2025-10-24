from fastapi import APIRouter
from typing import Optional, List, Tuple
from slurpy.domain.cel.service import make_patch, cel_reason  # re-exported from service

router = APIRouter()

@router.post("/patch")
def cel_patch(label: str, prob: float, persona: str = "therapist", text: Optional[str] = None):
    return make_patch(label, prob, text=text, persona=persona)  # if signature differs, adjust


@router.post("/reason")
def cel_reason_endpoint(text: str, history: Optional[List[Tuple[float, float]]] = None):
    """
    Returns compact causal bundle when CEL_V2_CAUSAL is enabled; else {}.
    history is optional list of [valence, arousal] pairs to compute rolling state.
    """
    return cel_reason(text, history)
