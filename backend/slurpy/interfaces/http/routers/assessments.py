"""
Assessment API Endpoints
FastAPI routes for PHQ-9, GAD-7, and assessment management
Pure backend scoring - NO Claude calls
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Literal
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Import our backend services
# from slurpy.domain.assessments.service import AssessmentService, PHQ9Scorer, GAD7Scorer
# from slurpy.domain.treatment.phase_detection import TreatmentPhaseDetector, TreatmentStatusService
# from slurpy.lib.auth import require_user

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class PHQ9ResponseRequest(BaseModel):
    """PHQ-9 assessment responses"""
    
    q1: int = Field(..., ge=0, le=3, description="Little interest/pleasure")
    q2: int = Field(..., ge=0, le=3, description="Feeling down/depressed")
    q3: int = Field(..., ge=0, le=3, description="Trouble sleeping")
    q4: int = Field(..., ge=0, le=3, description="Feeling tired/low energy")
    q5: int = Field(..., ge=0, le=3, description="Appetite changes")
    q6: int = Field(..., ge=0, le=3, description="Feeling bad about yourself")
    q7: int = Field(..., ge=0, le=3, description="Trouble concentrating")
    q8: int = Field(..., ge=0, le=3, description="Moving/speaking slowly or quickly")
    q9: int = Field(..., ge=0, le=3, description="Thoughts of self-harm")
    
    context_notes: Optional[str] = Field(None, max_length=500)
    
    @validator("q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9")
    def validate_range(cls, v):
        if not isinstance(v, int) or v < 0 or v > 3:
            raise ValueError("Each response must be 0-3")
        return v


class GAD7ResponseRequest(BaseModel):
    """GAD-7 assessment responses"""
    
    q1: int = Field(..., ge=0, le=3, description="Nervous, anxious, on edge")
    q2: int = Field(..., ge=0, le=3, description="Unable to stop/control worrying")
    q3: int = Field(..., ge=0, le=3, description="Worry about different things")
    q4: int = Field(..., ge=0, le=3, description="Trouble relaxing")
    q5: int = Field(..., ge=0, le=3, description="So restless hard to sit still")
    q6: int = Field(..., ge=0, le=3, description="Becoming easily annoyed/irritable")
    q7: int = Field(..., ge=0, le=3, description="Afraid something bad might happen")
    
    context_notes: Optional[str] = Field(None, max_length=500)


class AssessmentResponse(BaseModel):
    """Assessment results returned to client"""
    
    id: str
    assessment_type: Literal["phq9", "gad7"]
    total_score: int
    severity: str
    percentile: int
    baseline_score: Optional[int]
    change_from_baseline: Optional[int]
    response_status: Literal["responding", "partial_response", "no_response", "worsening"]
    suicide_risk: Optional[Literal["low", "moderate", "elevated"]]
    created_at: datetime
    
    next_assessment_recommended_days: int


class AssessmentHistoryResponse(BaseModel):
    """Assessment history"""
    
    assessments: List[Dict]
    trend: Dict  # {"trend": "improving", "velocity": -1.5, ...}
    current_phase: str
    phase_definition: Dict


class BaselineIntakeRequest(BaseModel):
    """Collect baseline info at start of treatment"""
    
    age: Optional[int]
    gender: Optional[str]
    primary_concern: str = Field(..., max_length=200)
    onset_date: Optional[datetime]
    previous_treatment: bool = False
    current_medications: Optional[List[str]]
    
    initial_phq9: Optional[PHQ9ResponseRequest]
    initial_gad7: Optional[GAD7ResponseRequest]


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/phq9")
async def submit_phq9_assessment(
    request: PHQ9ResponseRequest,
    user_req: Request,
    # user_id: str = Depends(require_user),
    # assessment_service: AssessmentService = Depends(),
):
    """
    Submit PHQ-9 assessment responses
    
    Returns: Assessment results with score, severity, change from baseline
    
    Example:
    ```
    POST /api/assessments/phq9
    {
      "q1": 2, "q2": 2, "q3": 1, "q4": 0, "q5": 1,
      "q6": 2, "q7": 1, "q8": 0, "q9": 0,
      "context_notes": "Post-medication change"
    }
    ```
    
    Returns:
    ```
    {
      "id": "uuid",
      "total_score": 12,
      "severity": "mild",
      "percentile": 45,
      "change_from_baseline": -6,
      "response_status": "responding",
      "suicide_risk": "low",
      "next_assessment_recommended_days": 7
    }
    ```
    """
    try:
        # TODO: Integrate with AssessmentService once DB is set up
        # result = await assessment_service.create_assessment(
        #     user_id=user_id,
        #     responses=request.dict(),
        #     assessment_type="phq9",
        #     context_notes=request.context_notes,
        # )
        
        # For now, return mock response
        responses = {
            "q1": request.q1,
            "q2": request.q2,
            "q3": request.q3,
            "q4": request.q4,
            "q5": request.q5,
            "q6": request.q6,
            "q7": request.q7,
            "q8": request.q8,
            "q9": request.q9,
        }
        total_score = sum(responses.values())
        
        # Map to severity
        if total_score <= 4:
            severity = "minimal"
        elif total_score <= 9:
            severity = "mild"
        elif total_score <= 14:
            severity = "moderate"
        elif total_score <= 19:
            severity = "moderately_severe"
        else:
            severity = "severe"
        
        # Suicide risk from Q9
        suicide_risk = "elevated" if request.q9 >= 2 else "low"
        
        return {
            "id": "phq9-uuid-123",
            "assessment_type": "phq9",
            "total_score": total_score,
            "severity": severity,
            "percentile": 45,
            "baseline_score": None,
            "change_from_baseline": None,
            "response_status": "no_response",  # First-time takers
            "suicide_risk": suicide_risk,
            "created_at": datetime.utcnow(),
            "next_assessment_recommended_days": 7,
        }
        
    except Exception as e:
        logger.error(f"PHQ-9 submission error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Assessment error: {str(e)}")


@router.post("/gad7")
async def submit_gad7_assessment(
    request: GAD7ResponseRequest,
    user_req: Request,
):
    """
    Submit GAD-7 assessment responses
    
    Similar to PHQ-9 endpoint but for anxiety
    """
    try:
        responses = {
            "q1": request.q1,
            "q2": request.q2,
            "q3": request.q3,
            "q4": request.q4,
            "q5": request.q5,
            "q6": request.q6,
            "q7": request.q7,
        }
        total_score = sum(responses.values())
        
        if total_score <= 4:
            severity = "minimal"
        elif total_score <= 9:
            severity = "mild"
        elif total_score <= 14:
            severity = "moderate"
        else:
            severity = "severe"
        
        return {
            "id": "gad7-uuid-123",
            "assessment_type": "gad7",
            "total_score": total_score,
            "severity": severity,
            "percentile": 50,
            "baseline_score": None,
            "change_from_baseline": None,
            "response_status": "no_response",
            "suicide_risk": None,
            "created_at": datetime.utcnow(),
            "next_assessment_recommended_days": 7,
        }
        
    except Exception as e:
        logger.error(f"GAD-7 submission error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Assessment error: {str(e)}")


@router.get("/phq9/questions")
async def get_phq9_questions():
    """
    Get PHQ-9 questions for display in UI
    
    Returns: Array of questions with descriptions
    """
    questions = [
        {
            "number": 1,
            "question": "Over the last 2 weeks, how often have you been bothered by little interest or pleasure in doing things?",
            "key": "q1",
        },
        {
            "number": 2,
            "question": "Over the last 2 weeks, how often have you been bothered by feeling down, depressed, or hopeless?",
            "key": "q2",
        },
        {
            "number": 3,
            "question": "Over the last 2 weeks, how often have you been bothered by trouble falling or staying asleep, or sleeping too much?",
            "key": "q3",
        },
        {
            "number": 4,
            "question": "Over the last 2 weeks, how often have you been bothered by feeling tired or having little energy?",
            "key": "q4",
        },
        {
            "number": 5,
            "question": "Over the last 2 weeks, how often have you been bothered by poor appetite or overeating?",
            "key": "q5",
        },
        {
            "number": 6,
            "question": "Over the last 2 weeks, how often have you been bothered by feeling bad about yourself — or that you are a failure or have let yourself or your family down?",
            "key": "q6",
        },
        {
            "number": 7,
            "question": "Over the last 2 weeks, how often have you been bothered by trouble concentrating on things, such as reading the newspaper or watching television?",
            "key": "q7",
        },
        {
            "number": 8,
            "question": "Over the last 2 weeks, how often have you been bothered by moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual?",
            "key": "q8",
        },
        {
            "number": 9,
            "question": "Over the last 2 weeks, how often have you had thoughts that you would be better off dead, or of hurting yourself?",
            "key": "q9",
            "safety_critical": True,
        },
    ]
    
    options = [
        {"value": 0, "label": "Not at all"},
        {"value": 1, "label": "Several days"},
        {"value": 2, "label": "More than half the days"},
        {"value": 3, "label": "Nearly every day"},
    ]
    
    return {
        "assessment_type": "phq9",
        "title": "PHQ-9: Patient Health Questionnaire",
        "description": "This questionnaire asks about your experiences over the last 2 weeks.",
        "questions": questions,
        "options": options,
        "time_estimate_seconds": 180,
    }


@router.get("/gad7/questions")
async def get_gad7_questions():
    """Get GAD-7 questions"""
    questions = [
        {"number": 1, "question": "Feeling nervous, anxious or on edge", "key": "q1"},
        {"number": 2, "question": "Not being able to stop or control worrying", "key": "q2"},
        {"number": 3, "question": "Worrying too much about different things", "key": "q3"},
        {"number": 4, "question": "Trouble relaxing", "key": "q4"},
        {"number": 5, "question": "Being so restless that it is hard to sit still", "key": "q5"},
        {"number": 6, "question": "Becoming easily annoyed or irritable", "key": "q6"},
        {"number": 7, "question": "Feeling afraid as if something awful might happen", "key": "q7"},
    ]
    
    options = [
        {"value": 0, "label": "Not at all"},
        {"value": 1, "label": "Several days"},
        {"value": 2, "label": "More than half the days"},
        {"value": 3, "label": "Nearly every day"},
    ]
    
    return {
        "assessment_type": "gad7",
        "title": "GAD-7: Generalized Anxiety Disorder",
        "description": "Over the last 2 weeks, how often have you been bothered by...",
        "questions": questions,
        "options": options,
        "time_estimate_seconds": 120,
    }


@router.get("/history/{assessment_type}")
async def get_assessment_history(
    assessment_type: Literal["phq9", "gad7"],
    limit: int = 10,
    user_req: Request = None,
):
    """
    Get user's assessment history
    
    Shows all past assessments and trend analysis
    """
    # TODO: Integrate with AssessmentService
    
    return {
        "assessment_type": assessment_type,
        "assessments": [
            {
                "id": "uuid-1",
                "date": "2025-02-21",
                "score": 18,
                "severity": "moderate",
                "change": -2,
            },
            {
                "id": "uuid-2",
                "date": "2025-02-14",
                "score": 20,
                "severity": "moderate",
                "change": -4,
            },
            {
                "id": "uuid-3",
                "date": "2025-02-07",
                "score": 24,
                "severity": "moderately_severe",
                "change": None,
            },
        ],
        "trend": {
            "trend": "improving",
            "velocity": -2.0,
            "direction": "↓ Improving",
        },
    }


@router.get("/trend/{assessment_type}")
async def get_assessment_trend(
    assessment_type: Literal["phq9", "gad7"],
    weeks: int = 8,
    user_req: Request = None,
):
    """
    Get trend analysis for an assessment
    
    Shows improvement trajectory and weekly changes
    """
    # TODO: Integrate with AssessmentService.compute_trend()
    
    return {
        "assessment_type": assessment_type,
        "period_weeks": weeks,
        "baseline": 24,
        "current": 12,
        "total_improvement_percent": 50,
        "trend": "improving",
        "velocity_points_per_week": -2.0,
        "first_half_average": 22,
        "second_half_average": 12,
        "improvement_milestone": "50% improvement - You're responding well!",
    }


@router.post("/baseline")
async def create_baseline_intake(
    request: BaselineIntakeRequest,
    user_req: Request = None,
):
    """
    Create baseline assessment at start of treatment
    
    Stores demographic info and initial assessment scores
    Future assessments will be compared to this baseline
    """
    # TODO: Integrate with assessment service and treatment status service
    
    return {
        "baseline_id": "baseline-uuid",
        "user_id": "user-123",
        "created_at": datetime.utcnow(),
        "assessments_created": ["phq9", "gad7"] if request.initial_phq9 and request.initial_gad7 else [],
        "baseline_scores": {
            "phq9": 24 if request.initial_phq9 else None,
            "gad7": 18 if request.initial_gad7 else None,
        },
        "next_assessment_due": "2025-02-28",
    }


@router.get("/phase")
async def get_current_phase(user_req: Request = None):
    """
    Get user's current treatment phase and context
    
    Phase determines which interventions are recommended
    and what response style the AI should use
    """
    # TODO: Integrate with TreatmentPhaseDetector
    
    return {
        "phase": "skill_building",
        "days_in_phase": 14,
        "phase_definition": {
            "name": "skill_building",
            "description": "Comprehensive coping skill development",
            "goals": [
                "Teach 4-6 evidence-based skills",
                "Build proficiency through practice",
                "Establish homework routine",
            ],
            "key_interventions": [
                "Cognitive therapy (thought records)",
                "Behavioral activation",
                "Exposure therapy (gentle)",
            ],
        },
        "relapse_risk": "low",
    }


@router.post("/session-end")
async def process_session_end(
    session_data: Dict,
    user_req: Request = None,
):
    """
    Process end of chat session
    
    Updates engagement metrics and could trigger scheduled assessment
    """
    return {
        "session_id": "session-uuid",
        "processed": True,
        "session_duration_minutes": 15,
        "messages_exchanged": 8,
        "skills_discussed": ["grounding", "thought_record"],
        "assessment_recommended": False,
        "next_action": "Continue practicing skills",
    }


# ============================================================================
# Health check
# ============================================================================

@router.get("/health")
async def health_check():
    """Assessment service health check"""
    return {
        "status": "healthy",
        "service": "assessments",
        "version": "1.0.0",
    }
