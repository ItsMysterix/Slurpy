"""
Treatment Phase Detection Service - Pure backend logic
Determines user's therapeutic stage based on:
- Session count
- Time in treatment
- Symptom severity
- Skill mastery
- Engagement patterns

NO AI CALLS - Rule-based + trained model
"""

from typing import Literal, Optional, List, Dict
from datetime import datetime, timedelta
from enum import Enum
import json

TherapyPhase = Literal["intake", "stabilization", "skill_building", "integration", "maintenance"]

class PhaseDefinitions:
    """Reference definitions for each phase"""
    
    INTAKE = {
        "name": "intake",
        "order": 1,
        "duration_weeks": 1,
        "description": "Initial assessment and alliance building",
        "typical_duration_days": (0, 7),
        "goals": [
            "Establish safety and trust",
            "Collect baseline symptoms",
            "Introduce therapist/AI",
            "Create treatment plan",
        ],
        "interventions": [
            "Psychoeducation",
            "Safety assessment",
            "Goal setting",
            "Crisis planning if needed",
        ],
        "success_criteria": "User feels understood; baseline PHQ-9/GAD-7 collected",
        "response_template_style": "welcoming, thorough, assessment-focused",
    }
    
    STABILIZATION = {
        "name": "stabilization",
        "order": 2,
        "duration_weeks": 2,
        "description": "Immediate symptom relief and basic coping",
        "typical_duration_days": (7, 21),
        "goals": [
            "Reduce acute symptoms",
            "Teach 1-2 core crisis skills",
            "Build early wins",
            "Establish routine/habit",
        ],
        "interventions": [
            "Box breathing",
            "5-4-3-2-1 grounding",
            "Psychoeducation (why symptoms happen)",
            "Sleep/nutrition basics",
            "Safety planning",
        ],
        "success_criteria": "User reports symptom relief after skill use; 10%+ improvement",
        "response_template_style": "supportive, directive, skill-teaching, frequent check-ins",
    }
    
    SKILL_BUILDING = {
        "name": "skill_building",
        "order": 3,
        "duration_weeks": 4,
        "description": "Comprehensive coping skill development",
        "typical_duration_days": (21, 56),
        "goals": [
            "Teach 4-6 evidence-based skills",
            "Build proficiency through practice",
            "Establish homework routine",
            "Identify personal patterns",
        ],
        "interventions": [
            "Cognitive therapy (thought records)",
            "Behavioral activation",
            "Exposure therapy (gentle)",
            "Problem-solving",
            "Time management",
            "Assertiveness training",
        ],
        "success_criteria": "50%+ symptom reduction; multiple skills practiced regularly",
        "response_template_style": "encouraging, homework-focused, progressive difficulty",
    }
    
    INTEGRATION = {
        "name": "integration",
        "order": 4,
        "duration_weeks": 2,
        "description": "Real-world skill application",
        "typical_duration_days": (56, 70),
        "goals": [
            "Apply skills in real situations",
            "Build independence",
            "Identify and overcome setbacks",
            "Plan for maintenance",
        ],
        "interventions": [
            "Behavioral experiments",
            "Exposure hierarchies (stronger)",
            "Values clarification",
            "Relapse prevention planning",
            "Life goals exploration",
        ],
        "success_criteria": "User applying skills independently; 70%+ symptom reduction",
        "response_template_style": "collaborative, autonomy-supporting, preparatory",
    }
    
    MAINTENANCE = {
        "name": "maintenance",
        "order": 5,
        "duration_weeks": 999,
        "description": "Sustain gains and build resilience",
        "typical_duration_days": (70, 99999),
        "goals": [
            "Maintain symptom improvement",
            "Build deeper resilience",
            "Explore meaning and purpose",
            "Prevent relapse",
        ],
        "interventions": [
            "Monthly booster sessions",
            "Relapse prevention",
            "Meaning/values work",
            "Life satisfaction building",
            "Social connection",
        ],
        "success_criteria": "Sustained remission; engaging in meaningful activities",
        "response_template_style": "celebratory, autonomy-focused, occasional check-in",
    }
    
    @classmethod
    def get_phase(cls, phase: TherapyPhase) -> Dict:
        """Get phase definition"""
        phases = {
            "intake": cls.INTAKE,
            "stabilization": cls.STABILIZATION,
            "skill_building": cls.SKILL_BUILDING,
            "integration": cls.INTEGRATION,
            "maintenance": cls.MAINTENANCE,
        }
        return phases.get(phase)


class TreatmentPhaseDetector:
    """Detect user's current therapeutic phase using multiple signals"""
    
    @staticmethod
    def detect_phase_from_metrics(
        session_count: int,
        days_in_treatment: int,
        phq9_baseline: Optional[int],
        phq9_current: Optional[int],
        gad7_baseline: Optional[int],
        gad7_current: Optional[int],
        skills_learned: List[str],
        engagement_sessions_per_week: float,
        homework_adherence_pct: Optional[float],
    ) -> TherapyPhase:
        """
        Detect phase using clinical heuristics
        Prioritizes specific signals in order
        """
        
        # Signal 1: First 1-2 sessions → Intake
        if session_count <= 2:
            return "intake"
        
        # Signal 2: Crisis situation (high symptom, admitted to crisis) → Stabilization
        if phq9_current and phq9_current >= 20:
            return "stabilization"
        
        # Signal 3: Very early (< 2 weeks) → Stabilization
        if days_in_treatment < 14:
            return "stabilization"
        
        # Signal 4: First 4-6 weeks → Skill Building
        if days_in_treatment < 42:
            # But check if already made significant progress
            if phq9_baseline and phq9_current:
                improvement = (phq9_baseline - phq9_current) / phq9_baseline
                if improvement >= 0.50:  # 50%+ improvement
                    return "integration"
            return "skill_building"
        
        # Signal 5: 6-8 weeks, moderate progress → Integration
        if days_in_treatment < 56:
            if phq9_baseline and phq9_current:
                improvement = (phq9_baseline - phq9_current) / phq9_baseline
                if improvement >= 0.30:  # 30%+ improvement
                    return "integration"
            if len(skills_learned) >= 3:
                return "integration"
            return "skill_building"
        
        # Signal 6: 8+ weeks, or achieved remission → Maintenance
        if phq9_current and phq9_current <= 4:  # PHQ-9 remission
            return "maintenance"
        if gad7_current and gad7_current <= 4:  # GAD-7 remission
            return "maintenance"
        
        # Default: Maintenance after 8 weeks
        if days_in_treatment >= 56:
            return "maintenance"
        
        return "skill_building"
    
    @staticmethod
    def detect_relapse_risk(
        recent_assessments: List[Dict],
        historical_average: Optional[float],
    ) -> str:
        """
        Detect if user is trending toward relapse
        Returns: "low" | "moderate" | "elevated" | "immediate"
        """
        if len(recent_assessments) < 2:
            return "low"
        
        # Get last 3 scores
        recent_scores = [a["total_score"] for a in recent_assessments[-3:]]
        current_score = recent_scores[-1]
        
        # Check trend
        if len(recent_scores) >= 2:
            prev_score = recent_scores[-2]
            delta = current_score - prev_score
            
            # Rising scores = worsening (bad)
            if delta >= 5:  # Jumped 5+ points
                return "elevated"
            elif delta >= 3:
                return "moderate"
        
        # Check against historical average
        if historical_average:
            expected_range = (historical_average - 2, historical_average + 2)
            if current_score > expected_range[1]:
                return "moderate"
        
        return "low"


class TreatmentStatusService:
    """High-level treatment status operations"""
    
    def __init__(self, db_client):
        self.db = db_client
    
    async def update_treatment_phase(
        self,
        user_id: str,
        force_phase: Optional[TherapyPhase] = None,
    ) -> Dict:
        """
        Update user's treatment phase based on latest data
        If force_phase provided, override automatic detection
        
        Returns:
            {
              "phase": "skill_building",
              "days_in_phase": 14,
              "phase_definition": {...},
              "relapse_risk": "low",
            }
        """
        
        # Get current treatment status
        status_result = await self.db.table("treatment_status").select("*").eq(
            "user_id", user_id
        ).single().execute()
        
        if not status_result.data:
            # Create initial status
            await self.db.table("treatment_status").insert({
                "user_id": user_id,
                "current_phase": "intake",
                "phase_start_date": datetime.utcnow().isoformat(),
            }).execute()
            return {
                "phase": "intake",
                "days_in_phase": 0,
                "phase_definition": PhaseDefinitions.INTAKE,
            }
        
        status = status_result.data
        
        # If forced phase provided, use it
        if force_phase:
            new_phase = force_phase
        else:
            # Get assessment history to detect phase
            phq9_result = await self.db.table("assessment_responses").select("*").eq(
                "user_id", user_id
            ).eq("assessment_type", "phq9").order("created_at").execute()
            
            gad7_result = await self.db.table("assessment_responses").select("*").eq(
                "user_id", user_id
            ).eq("assessment_type", "gad7").order("created_at").execute()
            
            phq9_scores = [r["total_score"] for r in (phq9_result.data or [])]
            gad7_scores = [r["total_score"] for r in (gad7_result.data or [])]
            
            phq9_baseline = phq9_scores[0] if phq9_scores else None
            phq9_current = phq9_scores[-1] if phq9_scores else None
            gad7_baseline = gad7_scores[0] if gad7_scores else None
            gad7_current = gad7_scores[-1] if gad7_scores else None
            
            # Detect phase
            new_phase = TreatmentPhaseDetector.detect_phase_from_metrics(
                session_count=status.get("session_count", 0),
                days_in_treatment=status.get("days_in_current_phase", 0),
                phq9_baseline=phq9_baseline,
                phq9_current=phq9_current,
                gad7_baseline=gad7_baseline,
                gad7_current=gad7_current,
                skills_learned=status.get("skills_acquired", []),
                engagement_sessions_per_week=0,  # Could calculate from session history
                homework_adherence_pct=None,
            )
        
        # If phase changed, update start date
        phase_start_date = status["phase_start_date"]
        if new_phase != status.get("current_phase"):
            phase_start_date = datetime.utcnow().isoformat()
        
        # Calculate days in phase
        phase_start = datetime.fromisoformat(phase_start_date)
        days_in_phase = (datetime.utcnow() - phase_start).days
        
        # Update database
        await self.db.table("treatment_status").update({
            "current_phase": new_phase,
            "phase_start_date": phase_start_date,
            "days_in_current_phase": days_in_phase,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()
        
        # Check relapse risk
        relapse_risk = "low"
        if phq9_result.data:
            relapse_risk = TreatmentPhaseDetector.detect_relapse_risk(
                phq9_result.data,
                historical_average=None,  # Could compute rolling average
            )
        
        return {
            "phase": new_phase,
            "days_in_phase": days_in_phase,
            "phase_definition": PhaseDefinitions.get_phase(new_phase),
            "relapse_risk": relapse_risk,
        }
    
    async def get_phase_context(
        self,
        user_id: str,
    ) -> Dict:
        """
        Get all context needed for phase-aware response generation
        
        Returns:
            {
              "phase": "skill_building",
              "session_count": 12,
              "days_in_treatment": 28,
              "symptoms_improving": True,
              "latest_phq9": 12,
              "skills_learned": ["breathing", "grounding"],
              "response_style": "encouraging, homework-focused",
              "goals": [...],
            }
        """
        
        status = await self.update_treatment_phase(user_id)
        phase = status["phase"]
        phase_def = status["phase_definition"]
        
        return {
            "phase": phase,
            "phase_definition": phase_def,
            "response_style": phase_def["response_template_style"],
            "goals": phase_def["goals"],
            "key_interventions": phase_def["interventions"],
            "relapse_risk": status.get("relapse_risk"),
            "days_in_phase": status["days_in_phase"],
        }


# ============================================================================
# CLI Test
# ============================================================================

if __name__ == "__main__":
    # Test phase detection without database
    
    # Scenario 1: Day 1, new user
    phase = TreatmentPhaseDetector.detect_phase_from_metrics(
        session_count=1,
        days_in_treatment=0,
        phq9_baseline=18,
        phq9_current=18,
        gad7_baseline=15,
        gad7_current=15,
        skills_learned=[],
        engagement_sessions_per_week=0,
        homework_adherence_pct=0,
    )
    print(f"Scenario 1 (Day 1): {phase}")
    assert phase == "intake"
    
    # Scenario 2: Week 2, starting to stabilize
    phase = TreatmentPhaseDetector.detect_phase_from_metrics(
        session_count=5,
        days_in_treatment=10,
        phq9_baseline=18,
        phq9_current=16,
        gad7_baseline=15,
        gad7_current=14,
        skills_learned=["breathing", "grounding"],
        engagement_sessions_per_week=3,
        homework_adherence_pct=80,
    )
    print(f"Scenario 2 (Week 2): {phase}")
    assert phase == "stabilization"
    
    # Scenario 3: Week 4, good progress
    phase = TreatmentPhaseDetector.detect_phase_from_metrics(
        session_count=12,
        days_in_treatment=28,
        phq9_baseline=18,
        phq9_current=12,  # 33% improvement
        gad7_baseline=15,
        gad7_current=10,
        skills_learned=["breathing", "grounding", "reframe", "exposure"],
        engagement_sessions_per_week=3,
        homework_adherence_pct=75,
    )
    print(f"Scenario 3 (Week 4): {phase}")
    assert phase == "skill_building"
    
    # Scenario 4: Week 6, excellent progress
    phase = TreatmentPhaseDetector.detect_phase_from_metrics(
        session_count=16,
        days_in_treatment=42,
        phq9_baseline=18,
        phq9_current=9,  # 50% improvement
        gad7_baseline=15,
        gad7_current=7,
        skills_learned=["breathing", "grounding", "reframe", "exposure", "activation"],
        engagement_sessions_per_week=3,
        homework_adherence_pct=85,
    )
    print(f"Scenario 4 (Week 6, 50% improvement): {phase}")
    assert phase == "integration"
    
    # Scenario 5: Week 12, remission
    phase = TreatmentPhaseDetector.detect_phase_from_metrics(
        session_count=20,
        days_in_treatment=70,
        phq9_baseline=18,
        phq9_current=3,  # Remission!
        gad7_baseline=15,
        gad7_current=2,
        skills_learned=["breathing", "grounding", "reframe", "exposure", "activation"],
        engagement_sessions_per_week=1,
        homework_adherence_pct=90,
    )
    print(f"Scenario 5 (Week 12, remission): {phase}")
    assert phase == "maintenance"
    
    print("\nAll tests passed! ✓")
