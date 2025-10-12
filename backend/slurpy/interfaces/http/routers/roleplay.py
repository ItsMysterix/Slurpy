from fastapi import APIRouter
from typing import List, Dict, Any
from slurpy.domain.roleplay.service import PERSONAS, record, record_many, get_personas, get_system_for, get_history, summarize

router = APIRouter()

@router.get("/personas")
def personas():
    return get_personas()

@router.get("/system/{persona}")
def persona_system(persona: str):
    return {"system": get_system_for(persona)}

@router.post("/record")
def rp_record(session_id: str, persona: str, speaker: str, text: str, turn: int):
    record(session_id, persona, speaker, text, turn)
    return {"ok": True}

@router.post("/record_many")
def rp_record_many(session_id: str, entries: List[Dict[str, Any]]):
    record_many(session_id, entries)
    return {"ok": True}

@router.get("/history/{session_id}")
def rp_history(session_id: str, last_n: int = 50):
    return get_history(session_id, last_n=last_n)

@router.get("/summary/{session_id}")
def rp_summary(session_id: str):
    return summarize(session_id)
