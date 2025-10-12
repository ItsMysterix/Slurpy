from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class AddMemoryIn(BaseModel):
    user_id: str
    text: str
    emotion: str = "neutral"
    fruit: str = "Fresh Cucumber"
    intensity: float = 0.5
    context: Optional[Dict[str, Any]] = None

class RecallIn(BaseModel):
    user_id: str
    query: str
    k: int = 5

class RecallOut(BaseModel):
    hits: List[str] = []

class InsightsOut(BaseModel):
    total_memories: int = 0
    most_common_emotion: str = "neutral"
    emotion_distribution: Dict[str, int] = {}
    common_themes: List[str] = []
    average_intensity: float = 0.0
    conversation_span_days: int = 0
    recent_trend: str = "insufficient_data"

class ThemeSearchIn(BaseModel):
    user_id: str
    theme: str
    limit: int = 5

class ConversationContextIn(BaseModel):
    user_id: str
    current_message: str

class ConversationContextOut(BaseModel):
    context: str = ""
