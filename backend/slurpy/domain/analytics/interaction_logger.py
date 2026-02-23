"""
Interaction Logger for Continuous Improvement.

Logs every therapy interaction with full pipeline metadata
for future model retraining and quality analysis.

Stored as JSONL (one JSON object per line) for easy batch processing.

Usage:
    from slurpy.domain.analytics.interaction_logger import log_interaction
    
    log_interaction(
        user_id="user_123",
        session_id="sess_abc",
        user_message="I feel anxious about work",
        response="I hear the worry...",
        emotion="anxious",
        emotion_confidence=0.91,
        intent="daily_struggle",
        intent_confidence=0.78,
        severity="moderate",
        severity_score=0.55,
        phase="stabilization",
        themes=["work_stress", "anxiety"],
        candidates_count=3,
        ranker_score=0.82,
    )
"""

import json
import os
import threading
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

_LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "logs", "interactions")
_log_lock = threading.Lock()


def _ensure_log_dir() -> str:
    """Create log directory if needed. Returns the path."""
    log_dir = os.path.abspath(_LOG_DIR)
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


def log_interaction(
    user_id: str,
    session_id: str,
    user_message: str,
    response: str,
    emotion: str = "neutral",
    emotion_confidence: float = 0.0,
    intent: str = "exploring_feelings",
    intent_confidence: float = 0.0,
    severity: str = "moderate",
    severity_score: float = 0.5,
    phase: str = "stabilization",
    themes: Optional[List[str]] = None,
    candidates_count: int = 1,
    ranker_score: float = 0.0,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Log a therapy interaction to JSONL file.
    
    One file per day: interactions_2025-01-15.jsonl
    Thread-safe.
    """
    try:
        log_dir = _ensure_log_dir()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filepath = os.path.join(log_dir, f"interactions_{today}.jsonl")
        
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "session_id": session_id,
            "user_message": user_message,
            "response": response,
            "pipeline": {
                "emotion": emotion,
                "emotion_confidence": round(emotion_confidence, 4),
                "intent": intent,
                "intent_confidence": round(intent_confidence, 4),
                "severity": severity,
                "severity_score": round(severity_score, 4),
                "phase": phase,
                "themes": themes or [],
            },
            "generation": {
                "candidates_count": candidates_count,
                "ranker_score": round(ranker_score, 4),
            },
        }
        
        if extra:
            record["extra"] = extra
        
        line = json.dumps(record, ensure_ascii=False) + "\n"
        
        with _log_lock:
            with open(filepath, "a", encoding="utf-8") as f:
                f.write(line)
                
    except Exception as e:
        # Logging should never crash the app
        print(f"⚠️ Interaction logging failed: {e}")


def read_interactions(date: Optional[str] = None, limit: int = 100) -> List[Dict]:
    """
    Read logged interactions for analysis.
    
    Args:
        date: "2025-01-15" format. None = today.
        limit: Max records to return.
    
    Returns:
        List of interaction dicts.
    """
    log_dir = _ensure_log_dir()
    if date is None:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    filepath = os.path.join(log_dir, f"interactions_{date}.jsonl")
    
    if not os.path.exists(filepath):
        return []
    
    records = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
            if len(records) >= limit:
                break
    
    return records


def interaction_stats(date: Optional[str] = None) -> Dict[str, Any]:
    """
    Quick stats for a day's interactions.
    
    Returns:
        {
            "total": 42,
            "emotions": {"anxious": 12, "sad": 8, ...},
            "intents": {"relationship_issue": 5, ...},
            "avg_severity": 0.45,
            "avg_ranker_score": 0.78,
        }
    """
    records = read_interactions(date, limit=10000)
    
    if not records:
        return {"total": 0, "emotions": {}, "intents": {}, "avg_severity": 0, "avg_ranker_score": 0}
    
    emotions: Dict[str, int] = {}
    intents: Dict[str, int] = {}
    severities = []
    ranker_scores = []
    
    for r in records:
        p = r.get("pipeline", {})
        g = r.get("generation", {})
        
        em = p.get("emotion", "unknown")
        emotions[em] = emotions.get(em, 0) + 1
        
        intent = p.get("intent", "unknown")
        intents[intent] = intents.get(intent, 0) + 1
        
        severities.append(p.get("severity_score", 0.5))
        ranker_scores.append(g.get("ranker_score", 0))
    
    return {
        "total": len(records),
        "emotions": dict(sorted(emotions.items(), key=lambda x: -x[1])),
        "intents": dict(sorted(intents.items(), key=lambda x: -x[1])),
        "avg_severity": round(sum(severities) / len(severities), 3) if severities else 0,
        "avg_ranker_score": round(sum(ranker_scores) / len(ranker_scores), 3) if ranker_scores else 0,
    }
