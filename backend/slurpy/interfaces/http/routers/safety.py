from fastapi import APIRouter, Query
from typing import Optional, List
from slurpy.domain.safety.service import classify, crisis_message

router = APIRouter()

@router.get("/classify")
def safe_classify(text: str):
    level, details = classify(text)
    return {"level": level, "details": details}

@router.get("/crisis")
def safe_crisis(mem: Optional[List[str]] = Query(None), region: Optional[str] = None):
    return {"message": crisis_message(mem, region=region)}
