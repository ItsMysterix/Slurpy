from fastapi import APIRouter, Depends
from typing import Optional
from slurpy.interfaces.http.deps.auth import get_current_user
from slurpy.domain.memory.service import add_message, recall, get_user_insights, search_by_theme, get_conversation_context

router = APIRouter()

@router.post("/add")
def mem_add(text: str, emotion: str, fruit: str, intensity: float, session_id: Optional[str] = None, user=Depends(get_current_user)):
    ok = add_message(user["id"], text, emotion, fruit, intensity)
    return {"ok": ok}

@router.get("/recall")
def mem_recall(q: str, k: int = 5, user=Depends(get_current_user)):
    return {"memories": recall(user["id"], q, k=k)}

@router.get("/insights")
def mem_insights(user=Depends(get_current_user)):
    return get_user_insights(user["id"])

@router.get("/theme")
def mem_theme(theme: str, limit: int = 5, user=Depends(get_current_user)):
    return {"items": search_by_theme(user["id"], theme, limit=limit)}

@router.get("/context")
def mem_context(current_message: str, user=Depends(get_current_user)):
    return {"context": get_conversation_context(user["id"], current_message)}
