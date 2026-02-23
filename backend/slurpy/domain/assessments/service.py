"""
Assessment Service - PHQ-9, GAD-7, PCL-5 scoring
Pure backend implementation (zero external AI calls)
"""

from typing import Dict, List, Optional, TypedDict, Literal
from datetime import datetime, timedelta
import json

# PHQ-9 Question Mapping
PHQ9_QUESTIONS = {
    "q1": "Little interest or pleasure in doing things",
    "q2": "Feeling down, depressed, or hopeless",
    "q3": "Trouble falling or staying asleep, or sleeping too much",
    "q4": "Feeling tired or having little energy",
    "q5": "Poor appetite or overeating",
    "q6": "Feeling bad about yourself - or that you are a failure or have let your family down",
    "q7": "Trouble concentrating on things, such as reading the newspaper or watching television",
    "q8": "Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual",
    "q9": "Thoughts that you would be better off dead or of hurting yourself in some way",
}

# GAD-7 Question Mapping
GAD7_QUESTIONS = {
    "q1": "Feeling nervous, anxious or on edge",
    "q2": "Not being able to stop or control worrying",
    "q3": "Worrying too much about different things",
    "q4": "Trouble relaxing",
    "q5": "Being so restless that it is hard to sit still",
    "q6": "Becoming easily annoyed or irritable",
    "q7": "Feeling afraid as if something awful might happen",
}

class AssessmentResponse(TypedDict):
    """Structure for assessment submission"""
    responses: Dict[str, int]  # {"q1": 2, "q2": 1, ...}
    assessment_type: Literal["phq9", "gad7", "pcl5"]
    context_notes: Optional[str]


class ScoredAssessment(TypedDict):
    """Scored assessment result"""
    assessment_type: str
    total_score: int
    severity: str
    percentile: int  # Where user ranks vs population
    change_from_baseline: Optional[int]
    response_status: Optional[str]  # "responding", "non_responder", "remitted"


class PHQ9Scorer:
    """Score PHQ-9 (depression) - Pure backend, no AI calls"""
    
    @staticmethod
    def validate(responses: Dict[str, int]) -> tuple[bool, Optional[str]]:
        """Validate all 9 questions answered with 0-3 scale"""
        required_keys = set(f"q{i}" for i in range(1, 10))
        submitted_keys = set(responses.keys())
        
        if required_keys != submitted_keys:
            missing = required_keys - submitted_keys
            return False, f"Missing questions: {missing}"
        
        for key, value in responses.items():
            if not isinstance(value, int) or value < 0 or value > 3:
                return False, f"{key} must be 0-3, got {value}"
        
        return True, None
    
    @staticmethod
    def score(responses: Dict[str, int]) -> Dict[str, any]:
        """
        Score PHQ-9 (0-27 scale)
        
        Scoring:
        0-4 = Minimal depression
        5-9 = Mild depression
        10-14 = Moderate depression
        15-19 = Moderately severe depression
        20-27 = Severe depression
        """
        total = sum(responses.values())
        
        if total <= 4:
            severity = "minimal"
            percentile = 10  # Rough population estimate
        elif total <= 9:
            severity = "mild"
            percentile = 35
        elif total <= 14:
            severity = "moderate"
            percentile = 60
        elif total <= 19:
            severity = "moderately_severe"
            percentile = 80
        else:
            severity = "severe"
            percentile = 95
        
        # Q9 is suicide risk screener - flag separately
        suicide_risk = "high" if responses.get("q9", 0) >= 2 else "low"
        
        return {
            "total_score": total,
            "severity": severity,
            "percentile": percentile,
            "suicide_risk": suicide_risk,
            "remission_threshold": 4,  # Score needed for remission
            "response_threshold": total * 0.5,  # 50% improvement = response
        }

class GAD7Scorer:
    """Score GAD-7 (anxiety) - Pure backend"""
    
    @staticmethod
    def validate(responses: Dict[str, int]) -> tuple[bool, Optional[str]]:
        """Validate all 7 questions answered with 0-3 scale"""
        required_keys = set(f"q{i}" for i in range(1, 8))
        submitted_keys = set(responses.keys())
        
        if required_keys != submitted_keys:
            missing = required_keys - submitted_keys
            return False, f"Missing questions: {missing}"
        
        for key, value in responses.items():
            if not isinstance(value, int) or value < 0 or value > 3:
                return False, f"{key} must be 0-3, got {value}"
        
        return True, None
    
    @staticmethod
    def score(responses: Dict[str, int]) -> Dict[str, any]:
        """
        Score GAD-7 (0-21 scale)
        
        Scoring:
        0-4 = Minimal anxiety
        5-9 = Mild anxiety
        10-14 = Moderate anxiety
        15-21 = Severe anxiety
        """
        total = sum(responses.values())
        
        if total <= 4:
            severity = "minimal"
            percentile = 15
        elif total <= 9:
            severity = "mild"
            percentile = 45
        elif total <= 14:
            severity = "moderate"
            percentile = 70
        else:
            severity = "severe"
            percentile = 90
        
        return {
            "total_score": total,
            "severity": severity,
            "percentile": percentile,
            "remission_threshold": 4,
            "response_threshold": total * 0.5,
        }

class AssessmentService:
    """High-level assessment operations"""
    
    def __init__(self, db_client):
        """
        Args:
            db_client: Supabase async client for DB operations
        """
        self.db = db_client
    
    async def create_assessment(
        self,
        user_id: str,
        responses: Dict[str, int],
        assessment_type: str,
        context_notes: Optional[str] = None,
    ) -> Dict:
        """
        Store assessment and compute scores
        
        Returns:
            {
              "id": "uuid",
              "total_score": 15,
              "severity": "moderate",
              "change_from_baseline": -5 (if baseline exists),
              "response_status": "responding" (if 25%+ improvement),
            }
        """
        # 1. Validate
        if assessment_type == "phq9":
            validate_fn = PHQ9Scorer.validate
            score_fn = PHQ9Scorer.score
        elif assessment_type == "gad7":
            validate_fn = GAD7Scorer.validate
            score_fn = GAD7Scorer.score
        else:
            raise ValueError(f"Unknown assessment type: {assessment_type}")
        
        is_valid, error_msg = validate_fn(responses)
        if not is_valid:
            raise ValueError(f"Invalid responses: {error_msg}")
        
        # 2. Score
        scored = score_fn(responses)
        total_score = scored["total_score"]
        severity = scored["severity"]
        
        # 3. Get baseline (if exists)
        baseline_row = await self.db.table("baseline_measurements").select("*").eq(
            "user_id", user_id
        ).single().execute()
        
        baseline = baseline_row.data if baseline_row.data else None
        
        change_from_baseline = None
        response_status = None
        
        if baseline:
            if assessment_type == "phq9":
                baseline_score = baseline.get("phq9_baseline")
            else:  # gad7
                baseline_score = baseline.get("gad7_baseline")
            
            if baseline_score:
                change_from_baseline = baseline_score - total_score  # Negative is improvement
                improvement_pct = abs(change_from_baseline) / baseline_score * 100
                
                if improvement_pct >= 50:
                    response_status = "responding"
                elif total_score <= scored["remission_threshold"]:
                    response_status = "remitted"
                else:
                    response_status = "partial_response"
        
        # 4. Store in database
        result = await self.db.table("assessment_responses").insert({
            "user_id": user_id,
            "assessment_type": assessment_type,
            "responses": responses,
            "total_score": total_score,
            "severity": severity,
            "context_notes": context_notes,
            "is_complete": True,
            "is_baseline": baseline is None,  # First assessment is baseline
        }).execute()
        
        assessment_id = result.data[0]["id"] if result.data else None
        
        # 5. Update treatment status
        await self.db.table("treatment_status").update({
            f"latest_{assessment_type}": total_score,
            "last_assessment_date": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()
        
        return {
            "id": assessment_id,
            "assessment_type": assessment_type,
            "total_score": total_score,
            "severity": severity,
            "percentile": scored["percentile"],
            "change_from_baseline": change_from_baseline,  # None or delta
            "response_status": response_status,  # None, "responding", "remitted", "partial_response"
            "suicide_risk": scored.get("suicide_risk"),  # For PHQ-9 q9
        }
    
    async def get_assessment_history(
        self,
        user_id: str,
        assessment_type: str,
        limit: int = 10,
    ) -> List[Dict]:
        """
        Get assessment history (for graphs/trends)
        Returns last N assessments in chronological order
        """
        result = await self.db.table("assessment_responses").select("*").eq(
            "user_id", user_id
        ).eq(
            "assessment_type", assessment_type
        ).order("created_at", desc=True).limit(limit).execute()
        
        rows = result.data or []
        # Reverse to get chronological order (oldest first)
        return list(reversed(rows))
    
    async def compute_trend(
        self,
        user_id: str,
        assessment_type: str,
        weeks: int = 8,
    ) -> Dict:
        """
        Compute trend over last N weeks
        
        Returns:
            {
              "trend": "improving" | "stable" | "declining",
              "velocity": float,  # Points/week
              "first_half_avg": float,
              "second_half_avg": float,
            }
        """
        cutoff_date = datetime.utcnow() - timedelta(weeks=weeks)
        
        result = await self.db.table("assessment_responses").select("*").eq(
            "user_id", user_id
        ).eq(
            "assessment_type", assessment_type
        ).gte(
            "created_at", cutoff_date.isoformat()
        ).order("created_at").execute()
        
        scores = [row["total_score"] for row in (result.data or [])]
        
        if len(scores) < 2:
            return {
                "trend": "insufficient_data",
                "velocity": 0,
                "first_half_avg": scores[0] if scores else None,
                "second_half_avg": scores[-1] if scores else None,
            }
        
        # Split into halves
        midpoint = len(scores) // 2
        first_half = scores[:midpoint]
        second_half = scores[midpoint:]
        
        first_avg = sum(first_half) / len(first_half) if first_half else 0
        second_avg = sum(second_half) / len(second_half) if second_half else 0
        
        # Determine trend (negative is good for PHQ/GAD)
        delta = first_avg - second_avg
        
        if abs(delta) < 1:
            trend = "stable"
        elif delta > 0:
            trend = "improving"
        else:
            trend = "declining"
        
        # Velocity: points per week
        weeks_elapsed = len(scores) / 4  # Rough estimate (usually ~4 assessments/month)
        velocity = delta / weeks_elapsed if weeks_elapsed > 0 else 0
        
        return {
            "trend": trend,
            "velocity": round(velocity, 2),
            "first_half_avg": round(first_avg, 1),
            "second_half_avg": round(second_avg, 1),
            "delta": round(delta, 1),
        }


# ============================================================================
# CLI Test Helper
# ============================================================================

if __name__ == "__main__":
    # Quick test without database
    
    # Test PHQ-9
    phq9_responses = {
        "q1": 2, "q2": 2, "q3": 1, "q4": 2, "q5": 1,
        "q6": 2, "q7": 1, "q8": 0, "q9": 0
    }
    
    is_valid, _ = PHQ9Scorer.validate(phq9_responses)
    print(f"PHQ-9 Valid: {is_valid}")
    
    score = PHQ9Scorer.score(phq9_responses)
    print(f"PHQ-9 Score: {score['total_score']}/27 ({score['severity']})")
    print(f"Percentile: {score['percentile']}")
    print(f"Suicide Risk: {score['suicide_risk']}")
    
    # Test GAD-7
    gad7_responses = {
        "q1": 2, "q2": 2, "q3": 1, "q4": 2, "q5": 1, "q6": 0, "q7": 1
    }
    
    is_valid, _ = GAD7Scorer.validate(gad7_responses)
    print(f"\nGAD-7 Valid: {is_valid}")
    
    score = GAD7Scorer.score(gad7_responses)
    print(f"GAD-7 Score: {score['total_score']}/21 ({score['severity']})")
    print(f"Percentile: {score['percentile']}")
