"""
Integration Guide: Wiring Phase 1 Backend into Existing Codebase

This document shows how to integrate the new assessment/outcome system
into the existing Slurpy codebase.
"""

# ============================================================================
# 1. WIRE DATABASE ENDPOINTS
# ============================================================================

# FILE: backend/slurpy/interfaces/http/routers/assessments.py
# CHANGE: Replace mock responses with real database calls

# BEFORE (current code):
@router.post("/phq9")
async def submit_phq9_assessment(request: PHQ9ResponseRequest, user_req: Request):
    # Returns mock data
    return {"total_score": 12, "severity": "mild"}

# AFTER:
"""
from slurpy.domain.assessments.service import AssessmentService
from slurpy.lib.auth import require_user

@router.post("/phq9")
async def submit_phq9_assessment(
    request: PHQ9ResponseRequest,
    user_req: Request,
    user_id: str = Depends(require_user),
):
    # Get authenticated user
    db_client = request.state.supabase  # Injected from middleware
    
    # Create assessment
    assessment_service = AssessmentService(db_client)
    result = await assessment_service.create_assessment(
        user_id=user_id,
        responses={
            "q1": request.q1, "q2": request.q2, ... "q9": request.q9
        },
        assessment_type="phq9",
        context_notes=request.context_notes,
    )
    
    # Get phase context for response generation
    phase_service = TreatmentPhaseDetector(db_client)
    phase_context = await phase_service.update_treatment_phase(user_id)
    
    return {
        "id": result["id"],
        "total_score": result["total_score"],
        "severity": result["severity"],
        "percentile": result["percentile"],
        "change_from_baseline": result["change_from_baseline"],
        "response_status": result["response_status"],
        "suicide_risk": result["suicide_risk"],
        "current_phase": phase_context["phase"],
        "next_assessment_recommended_days": 7,
    }
"""


# ============================================================================
# 2. INTEGRATE PHASE-AWARE RESPONSES INTO CHAT
# ============================================================================

# FILE: backend/slurpy/domain/rag/service.py (existing)
# CHANGE: Modify response generation to use phase-aware templates

# BEFORE (current code - Claude-only):
def build_stream_prompt(messages, context) -> str:
    # Build RAG-based prompt, call Claude for everything
    return f"""You are a therapist...{context}"""

# AFTER:
"""
from slurpy.domain.treatment.phase_detection import TreatmentPhaseDetector
from slurpy.domain.responses.stage_aware_templates import (
    StageAwareResponseBuilder,
    StageAwareTemplates,
)

async def build_stream_prompt(
    messages: List[Dict],
    context: Dict,
    user_id: str,
    db_client,
) -> str:
    # Get user's current phase
    phase_detector = TreatmentPhaseDetector(db_client)
    phase_context = await phase_detector.get_phase_context(user_id)
    current_phase = phase_context["phase"]
    
    # Get user's latest assessment for emotion detection
    latest_assessment = await db_client.table("assessment_responses").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).limit(1).execute()
    
    current_mood = StageAwareTemplates.assess_user_emotion(
        messages[-1]["content"],
        current_assessment=latest_assessment.data[0] if latest_assessment.data else None,
    )
    
    # Build response using templates (no Claude needed for basic cases)
    builder = StageAwareResponseBuilder(current_phase)
    
    # Determine response type
    user_text = messages[-1]["content"].lower()
    
    if "help" in user_text or "start" in user_text:
        template_response = builder.build_opening_response(messages[-1]["content"])
    elif current_mood == "crisis":
        template_response = builder.build_crisis_response(messages[-1]["content"])
    else:
        template_response = builder.build_validation_response([])
    
    # Return template response or use Claude for complex cases
    if current_mood != "crisis" and len(template_response) > 50:
        return template_response  # Use template
    else:
        # Fall back to Claude for edge cases
        return f\"\"\"You are a therapeutic AI assistant in the {current_phase} phase.
        {template_response}
        
        Continue the conversation naturally while maintaining the {current_phase} phase approach.
        Response style: {phase_context['response_style']}\"\"\"
"""


# ============================================================================
# 3. INTEGRATE OUTCOME TRACKING INTO SESSION
# ============================================================================

# FILE: app/api/chat/message/route.ts (existing)
# CHANGE: Track which interventions are used

# BEFORE:
"""
export async function POST(request: Request) {
  const body = await request.json()
  const response = await callChatBackend(body)
  return Response.json(response)
}
"""

# AFTER:
"""
export async function POST(request: Request) {
  const body = await request.json()
  const response = await callChatBackend(body)
  
  // Extract interventions mentioned in response
  const interventions = detectInterventions(response.text)
  
  if (interventions.length > 0) {
    // Track that these were discussed
    await recordInterventionMention({
      userId: body.userId,
      sessionId: body.sessionId,
      interventions,
      timestamp: new Date(),
    })
  }
  
  return Response.json(response)
}
"""


# ============================================================================
# 4. CREATE ASSESSMENT SCHEDULING
# ============================================================================

# FILE: NEW: backend/slurpy/domain/scheduling/service.py
# CHANGE: Add automatic assessment scheduling

"""
class AssessmentScheduler:
    \"\"\"Schedule periodic assessments\"\"\"
    
    async def schedule_next_assessment(
        self,
        user_id: str,
        assessment_type: str,
        db_client,
    ):
        # Determine when next assessment should be
        # Rules: baseline is Day 1, then Day 7, Week 3, Week 6, etc.
        
        current_phase_result = await db_client.table("treatment_status").select(
            "*"
        ).eq("user_id", user_id).single().execute()
        
        phase = current_phase_result.data["current_phase"]
        
        # Assessment frequency depends on phase
        if phase == "intake":
            days_until_next = 1  # Next day
        elif phase == "stabilization":
            days_until_next = 7  # Weekly
        elif phase in ["skill_building", "integration"]:
            days_until_next = 7  # Weekly  
        else:  # maintenance
            days_until_next = 30  # Monthly
        
        next_date = datetime.utcnow() + timedelta(days=days_until_next)
        
        await db_client.table("assessment_schedule").insert({
            "user_id": user_id,
            "assessment_type": assessment_type,
            "scheduled_date": next_date.isoformat(),
            "reminder_sent": False,
            "status": "pending",
        }).execute()
        
        return next_date
"""


# ============================================================================
# 5. CREATE ASSESSMENT REMINDER SYSTEM
# ============================================================================

# FILE: NEW: backend/scripts/send_assessment_reminders.py
# CHANGE: Periodic job to send reminders

"""
import asyncio
from datetime import datetime, timedelta
from slurpy.lib.notifications import send_reminder

async def send_assessment_reminders():
    \"\"\"Send reminders for pending assessments\"\"\"
    
    db = get_db()
    
    # Find due/overdue assessments
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat()
    
    due_assessments = await db.table("assessment_schedule").select("*").lte(
        "scheduled_date", tomorrow
    ).eq("reminder_sent", False).eq("status", "pending").execute()
    
    for assessment in due_assessments.data or []:
        user_id = assessment["user_id"]
        assessment_type = assessment["assessment_type"]
        
        # Send push notification
        await send_reminder(
            user_id,
            f"Time for your weekly {assessment_type} check-in",
            f"Let's see how you're doing",
        )
        
        # Mark reminder sent
        await db.table("assessment_schedule").update({
            "reminder_sent": True,
        }).eq("id", assessment["id"]).execute()

# Schedule to run daily:
# In deployment: Supabase cron or Temporal job
# Locally: $ python -m slurpy.scripts.send_assessment_reminders
"""


# ============================================================================
# 6. INTEGRATE INTO EXISTING SESSION SUMMARY
# ============================================================================

# FILE: lib/session-summary.ts (existing)
# CHANGE: Use phase context + outcome data

# BEFORE:
"""
export async function generateSessionSummary(sessionId: string) {
  // Claude-based summary
  const summary = await callClaude(`
    Summary this session...
  `)
  return summary
}
"""

# AFTER:
"""
export async function generateSessionSummary(
  sessionId: string,
  userId: string,
) {
  // Get user's current phase
  const { data: { data: treatment_status } } = await supabase
    .from('treatment_status')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  const phase = treatment_status?.current_phase || 'skill_building'
  
  // Get last assessment
  const { data: { data: assessments } } = await supabase
    .from('assessment_responses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
  
  const improvement = assessments?.[0]?.symptom_improvement_pct || 0
  
  // Use phase-aware template
  const phaseTemplate = getPhaseTemplate(phase)
  
  // Could still use Claude for complex summaries
  const summary = await callClaude(`
    Generate a session summary in the ${phase} phase.
    Template: ${phaseTemplate}
    User improvement: ${improvement}%
    Recent discussion: [...]
  `)
  
  return summary
}
"""


# ============================================================================
# 7. WIRE OUTCOME PREDICTIONS TO RECOMMENDATION SYSTEM
# ============================================================================

# FILE: NEW: app/api/recommendations/route.ts
# CHANGE: Endpoint that returns personalized recommendations

"""
export async function GET(request: Request) {
  const userId = await getUser(request)
  
  // Get personalized recommendations
  const response = await fetch(
    `${BACKEND_URL}/api/predictions/recommendations`,
    {
      method: 'GET',
      headers: {
        'X-User-ID': userId,
        'Authorization': `Bearer ${getToken()}`,
      },
    }
  )
  
  const recommendations = await response.json()
  
  return Response.json({
    nextIntervention: recommendations.next_recommended_intervention,
    effectivenessScore: recommendations.intervention_effectiveness,
    predictedResponse: recommendations.predicted_response_status,
    relapsePrediction: recommendations.predicted_relapse_risk,
    estimatedDaysToRemission: recommendations.predicted_days_to_remission,
  })
}
"""


# ============================================================================
# 8. HANDLE CRISIS ESCALATION
# ============================================================================

# FILE: backend/slurpy/domain/safety/service.py (enhance existing)
# CHANGE: Integrate with phase-aware crisis handling

"""
async def detect_and_handle_crisis(
    user_text: str,
    user_id: str,
    current_assessment: Dict,
) -> Optional[CrisisAlert]:
    \"\"\"Detect crisis and escalate appropriately\"\"\"
    
    # Check phase
    phase_result = await db.table("treatment_status").select("*").eq(
        "user_id", user_id
    ).single().execute()
    
    phase = phase_result.data["current_phase"]
    
    # Get emotion detected
    mood = StageAwareTemplates.assess_user_emotion(user_text, current_assessment)
    
    if mood == "crisis":
        # Get crisis resources appropriate for phase
        resources = get_crisis_resources_for_phase(phase)
        
        # Log crisis event
        await db.table("crisis_events").insert({
            "user_id": user_id,
            "detected_at": datetime.utcnow().isoformat(),
            "text_snippet": user_text[:200],
            "phase": phase,
        }).execute()
        
        # Send alert to safety team if configured
        if user_id in HIGH_RISK_USERS:
            await notify_safety_team(user_id, user_text, resources)
        
        return CrisisAlert(
            severity="high",
            resources=resources,
            escalate=True,
        )
    
    return None
"""


# ============================================================================
# 9. ENVIRONMENT VARIABLES NEEDED
# ============================================================================

"""
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Backend
BACKEND_URL=http://localhost:8000  # Dev
BACKEND_URL=https://api.slurpy.com  # Prod

# Feature flags
ENABLE_PHQ9_ASSESSMENTS=true
ENABLE_PHASE_ROUTING=true
ENABLE_OUTCOME_TRACKING=true
ENABLE_FEEDBACK_LOOP=true

# Clinical config
ASSESSMENT_FREQUENCY_DAYS=7
CRISIS_ESCALATION_ENABLED=true
HIGH_RISK_USER_IDS=[]  # Comma-separated

# ML/Predictions
ENABLE_OUTCOME_PREDICTIONS=true
RETRAIN_MODELS_WEEKLY=true
PREDICTION_UPDATE_FREQUENCY_DAYS=7
"""


# ============================================================================
# 10. TESTING INTEGRATION
# ============================================================================

"""
# File: tests/integration/test_phase_routing.py

import pytest
from slurpy.domain.treatment.phase_detection import TreatmentPhaseDetector
from slurpy.domain.responses.stage_aware_templates import StageAwareTemplates


@pytest.mark.asyncio
async def test_intake_phase_response():
    # New user should get intake phase response
    phase = "intake"
    response = StageAwareTemplates.get_response(phase, "open_simple")
    assert "Tell me" in response or "share" in response.lower()


@pytest.mark.asyncio
async def test_phase_transitions():
    # Test automatic phase transitions
    scenarios = [
        {
            "session_count": 1,
            "days_in_treatment": 0,
            "expected_phase": "intake",
        },
        {
            "session_count": 5,
            "days_in_treatment": 10,
            "expected_phase": "stabilization",
        },
        {
            "session_count": 15,
            "days_in_treatment": 45,
            "phq9_improvement_pct": 0.40,
            "expected_phase": "integration",
        },
    ]
    
    for scenario in scenarios:
        phase = TreatmentPhaseDetector.detect_phase_from_metrics(**scenario)
        assert phase == scenario["expected_phase"]


@pytest.mark.asyncio  
async def test_crisis_detection():
    # Crisis text should be detected
    crisis_text = "I don't want to live anymore"
    mood = StageAwareTemplates.assess_user_emotion(crisis_text)
    assert mood == "crisis"


@pytest.mark.asyncio
async def test_assessment_scoring():
    from slurpy.domain.assessments.service import PHQ9Scorer
    
    scorer = PHQ9Scorer()
    result = scorer.score({
        "q1": 2, "q2": 2, "q3": 1, "q4": 0, "q5": 1,
        "q6": 2, "q7": 1, "q8": 0, "q9": 0,
    })
    
    assert result["total_score"] == 10
    assert result["severity"] == "mild"


@pytest.mark.asyncio
async def test_outcome_prediction():
    from slurpy.domain.outcomes.predictor import OutcomePredictor, UserOutcomeProfile
    
    profile = UserOutcomeProfile(
        user_id="test-user",
        baseline_phq9=20,
        baseline_gad7=16,
        total_sessions=12,
        days_in_treatment=42,
        current_phq9=10,
        current_gad7=8,
        phq9_improvement_pct=0.50,
        gad7_improvement_pct=0.50,
        response_status="responding",
        interventions_used=["breathing", "grounding"],
        homework_adherence_pct=85,
        session_consistency=2.5,
        engagement_level="high",
        relapse_risk="low",
        crisis_events=0,
        age_group=None,
        gender=None,
        culture=None,
    )
    
    next_intervention, score = OutcomePredictor.recommend_next_intervention(profile)
    assert next_intervention in ["thought_record", "behavioral_activation", "exposure"]
    assert score > 0.60
"""


# ============================================================================
# Deployment Checklist
# ============================================================================

"""
BEFORE DEPLOYING:

1. Database
   [ ] Run migration: supabase migration up
   [ ] Verify tables created: SELECT * FROM information_schema.tables
   [ ] Test RLS policies
   [ ] Create indexes

2. Backend
   [ ] Install dependencies: pip install -r requirements/assessment.txt
   [ ] Test scoring: pytest tests/unit/test_phq9_scorer.py
   [ ] Test phase detection: pytest tests/unit/test_phase_detection.py
   [ ] Test API endpoints: pytest tests/integration/test_assessment_api.py

3. Frontend
   [ ] Create assessment form component
   [ ] Wire form to API endpoints
   [ ] Test form submission
   [ ] Test result display

4. Monitoring
   [ ] Set up alerts for high suicide risk detection
   [ ] Monitor assessment submission rate
   [ ] Track phase distribution (intake vs maintenance ratio)
   [ ] Monitor outcome tracking accuracy

5. Clinical Validation
   [ ] PHQ-9 scoring matches NIMH reference
   [ ] GAD-7 scoring matches Spitzer reference
   [ ] Phase detection agrees with clinician review
   [ ] Crisis detection catches target cases

6. Documentation
   [ ] Update API documentation
   [ ] Create user guide for assessments
   [ ] Document phase-aware templates
   [ ] Create troubleshooting guide
"""
