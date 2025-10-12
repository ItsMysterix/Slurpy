from fastapi import APIRouter, Depends
from typing import List
from slurpy.interfaces.http.deps.auth import get_current_user
from slurpy.domain.plans.service import get_state, vote, roadmap  # if you placed plans under domain/plans/service.py
# If you kept it as backend/plans.py, change import to: from slurpy.plans import get_state, vote, roadmap

router = APIRouter()

@router.get("/state")
def plan_state(user=Depends(get_current_user)):
    return get_state(user["id"])

@router.post("/vote")
def plan_vote(themes: List[str], user=Depends(get_current_user)):
    return vote(user["id"], themes)

@router.get("/roadmap")
def plan_roadmap(user=Depends(get_current_user)):
    return roadmap(user["id"])
