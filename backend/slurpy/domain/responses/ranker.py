"""
Response Quality Ranker for Therapy Conversations.

Uses sentence-transformers to score candidate responses on:
  1. Empathy/Therapeutic alliance (does it resonate emotionally?)
  2. Relevance (does it address what the user said?)
  3. Safety (no harmful content)
  4. Actionability (provides something useful)
  5. Repetition avoidance (not repeating past responses)

No OpenAI. Uses locally-running models only.

Usage:
    from backend.slurpy.domain.responses.ranker import ResponseRanker
    
    ranker = ResponseRanker()
    best = ranker.rank(
        user_message="I feel so anxious",
        candidates=["response1", "response2", "response3"],
        conversation_history=["previous response"],
    )
"""

import re
import threading
from typing import List, Dict, Optional, Tuple
from sentence_transformers import SentenceTransformer, util

_st_model = None
_st_lock = threading.Lock()


def _get_st_model() -> SentenceTransformer:
    """Lazy-load sentence-transformers model."""
    global _st_model
    if _st_model is None:
        with _st_lock:
            if _st_model is None:
                _st_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _st_model


# ── Therapeutic quality indicators ────────────────────────────────

# Phrases that indicate GOOD therapeutic responses
EMPATHY_MARKERS = [
    "i hear", "i sense", "that sounds", "that must", "it makes sense",
    "i understand", "i can see", "i notice", "it's understandable",
    "that's really", "of course you", "no wonder you",
]

# Phrases that indicate actionable content
ACTIONABLE_MARKERS = [
    "try this", "one thing that", "a skill", "one technique",
    "here's what", "you could", "a practice", "let's",
    "when you notice", "next time", "what if you",
    "breathing", "grounding", "5-4-3-2-1", "opposite action",
    "reality-test", "evidence", "thought record", "journal",
]

# Phrases that indicate collaborative tone
COLLABORATIVE_MARKERS = [
    "what do you think", "what feels", "how does that",
    "would it help", "what would", "tell me more",
    "where do you want", "what matters", "what's one thing",
    "what do you need", "how can we",
]

# Harmful patterns (should never appear in therapy)
HARMFUL_PATTERNS = [
    r"\b(just get over it|stop feeling|you shouldn.t feel)\b",
    r"\b(that.s not a big deal|others have it worse)\b",
    r"\b(man up|grow up|toughen up|suck it up)\b",
    r"\b(you.re overreacting|you.re being dramatic)\b",
    r"\b(just be positive|just be happy|just relax)\b",
    r"\b(it could be worse|at least you)\b",
]


class ResponseRanker:
    """Scores and ranks therapy response candidates."""
    
    def __init__(self):
        self.model = _get_st_model()
    
    def rank(
        self,
        user_message: str,
        candidates: List[str],
        conversation_history: Optional[List[str]] = None,
        emotion: str = "neutral",
        severity: float = 0.5,
    ) -> List[Dict]:
        """
        Rank candidate responses by therapeutic quality.
        
        Returns list of dicts sorted by score (best first):
        [{"response": "...", "score": 0.85, "breakdown": {...}}, ...]
        """
        if not candidates:
            return []
        
        results = []
        for candidate in candidates:
            score, breakdown = self._score_response(
                user_message=user_message,
                response=candidate,
                history=conversation_history or [],
                emotion=emotion,
                severity=severity,
            )
            results.append({
                "response": candidate,
                "score": score,
                "breakdown": breakdown,
            })
        
        # Sort by score (highest first)
        results.sort(key=lambda x: x["score"], reverse=True)
        return results
    
    def pick_best(
        self,
        user_message: str,
        candidates: List[str],
        conversation_history: Optional[List[str]] = None,
        emotion: str = "neutral",
        severity: float = 0.5,
    ) -> Tuple[str, float]:
        """Return (best_response, score)."""
        ranked = self.rank(user_message, candidates, conversation_history, emotion, severity)
        if not ranked:
            return "", 0.0
        return ranked[0]["response"], ranked[0]["score"]
    
    def _score_response(
        self,
        user_message: str,
        response: str,
        history: List[str],
        emotion: str,
        severity: float,
    ) -> Tuple[float, Dict]:
        """Score a single response across multiple dimensions."""
        
        # 1. Relevance: semantic similarity to user message
        relevance = self._score_relevance(user_message, response)
        
        # 2. Empathy: does it acknowledge feelings?
        empathy = self._score_empathy(response)
        
        # 3. Actionability: does it provide something useful?
        actionability = self._score_actionability(response)
        
        # 4. Collaboration: does it invite the user in?
        collaboration = self._score_collaboration(response)
        
        # 5. Safety: no harmful content
        safety = self._score_safety(response)
        
        # 6. Novelty: not repeating past responses
        novelty = self._score_novelty(response, history)
        
        # 7. Length quality: not too short, not too long
        length_score = self._score_length(response, severity)
        
        # Weighted combination
        # Safety is a gate (if 0, everything is 0)
        # Higher severity → weight empathy more
        # Lower severity → weight actionability more
        
        if safety < 0.5:
            # Harmful response — score 0
            total = 0.0
        else:
            weights = {
                "relevance": 0.20,
                "empathy": 0.20 + (severity * 0.10),      # More empathy for high distress
                "actionability": 0.20 - (severity * 0.05),  # Less push for high distress
                "collaboration": 0.15,
                "novelty": 0.10,
                "length": 0.05,
                "safety": 0.10,
            }
            
            total = (
                weights["relevance"] * relevance +
                weights["empathy"] * empathy +
                weights["actionability"] * actionability +
                weights["collaboration"] * collaboration +
                weights["novelty"] * novelty +
                weights["length"] * length_score +
                weights["safety"] * safety
            )
        
        breakdown = {
            "relevance": round(relevance, 3),
            "empathy": round(empathy, 3),
            "actionability": round(actionability, 3),
            "collaboration": round(collaboration, 3),
            "safety": round(safety, 3),
            "novelty": round(novelty, 3),
            "length": round(length_score, 3),
        }
        
        return round(total, 3), breakdown
    
    def _score_relevance(self, user_message: str, response: str) -> float:
        """Semantic similarity between user message and response."""
        emb_user = self.model.encode(user_message, convert_to_tensor=True)
        emb_resp = self.model.encode(response, convert_to_tensor=True)
        sim = float(util.cos_sim(emb_user, emb_resp)[0][0])
        # Normalize to 0-1 (cosine sim can be negative)
        return max(0.0, min(1.0, (sim + 1) / 2))
    
    def _score_empathy(self, response: str) -> float:
        """Check for empathic language."""
        response_lower = response.lower()
        matches = sum(1 for marker in EMPATHY_MARKERS if marker in response_lower)
        # 1 match = 0.5, 2+ = 0.8, 3+ = 1.0
        if matches >= 3:
            return 1.0
        elif matches >= 2:
            return 0.8
        elif matches >= 1:
            return 0.5
        return 0.1  # Some empathy should always be present
    
    def _score_actionability(self, response: str) -> float:
        """Check for actionable content (skills, suggestions)."""
        response_lower = response.lower()
        matches = sum(1 for marker in ACTIONABLE_MARKERS if marker in response_lower)
        if matches >= 3:
            return 1.0
        elif matches >= 2:
            return 0.8
        elif matches >= 1:
            return 0.5
        return 0.2
    
    def _score_collaboration(self, response: str) -> float:
        """Check for collaborative/inviting tone."""
        response_lower = response.lower()
        # Must end with or contain a question / invitation
        has_question = "?" in response
        matches = sum(1 for marker in COLLABORATIVE_MARKERS if marker in response_lower)
        
        if has_question and matches >= 1:
            return 1.0
        elif has_question:
            return 0.7
        elif matches >= 1:
            return 0.5
        return 0.1
    
    def _score_safety(self, response: str) -> float:
        """Check for harmful content. Returns 0 if harmful, 1 if safe."""
        response_lower = response.lower()
        for pattern in HARMFUL_PATTERNS:
            if re.search(pattern, response_lower):
                return 0.0
        return 1.0
    
    def _score_novelty(self, response: str, history: List[str]) -> float:
        """Check that response isn't too similar to recent responses."""
        if not history:
            return 1.0
        
        emb_resp = self.model.encode(response, convert_to_tensor=True)
        emb_hist = self.model.encode(history[-3:], convert_to_tensor=True)  # Last 3
        
        sims = util.cos_sim(emb_resp, emb_hist)[0]
        max_sim = float(sims.max())
        
        # High similarity to past = low novelty
        if max_sim > 0.9:
            return 0.1
        elif max_sim > 0.8:
            return 0.3
        elif max_sim > 0.7:
            return 0.5
        elif max_sim > 0.6:
            return 0.7
        return 1.0
    
    def _score_length(self, response: str, severity: float) -> float:
        """Score response length appropriateness."""
        words = len(response.split())
        
        # Crisis = shorter, more direct (30-60 words)
        # Normal = medium (50-100 words)
        # Skill building = can be longer (60-120 words)
        
        if severity > 0.8:
            ideal_min, ideal_max = 20, 60
        elif severity > 0.5:
            ideal_min, ideal_max = 40, 100
        else:
            ideal_min, ideal_max = 50, 120
        
        if ideal_min <= words <= ideal_max:
            return 1.0
        elif words < ideal_min:
            return max(0.3, words / ideal_min)
        else:
            return max(0.3, ideal_max / words)
