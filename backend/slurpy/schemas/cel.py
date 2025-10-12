from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field

class CELPatchIn(BaseModel):
    label: str = Field(..., description="Classifier label (e.g., anxious)")
    prob: float = Field(0.0, ge=0, le=1)
    persona: str = Field("therapist")
    text: Optional[str] = Field(None, description="Optional raw text for extra hints")

class CELPatchOut(BaseModel):
    system_addendum: str = ""
    user_preface: str = ""
    tool_hint: Optional[str] = None
    max_questions: int = 2
    safety: Optional[str] = None
