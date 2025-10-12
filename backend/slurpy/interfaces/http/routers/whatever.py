# slurpy/interfaces/http/routers/whatever.py
from fastapi import APIRouter, Depends
from slurpy.interfaces.http.deps.auth import get_current_user

router = APIRouter()

@router.get("/me")
def me(user = Depends(get_current_user)):
    return user
