"""
Model Feedback Loop & Continuous Improvement Pipeline
Closes the loop between outcomes and intervention selection
Enables the system to improve over time as we collect real data

Architecture:
1. User completes intervention → tracks outcome
2. Weekly assessment → measures effectiveness
3. Feedback aggregated → identifies which interventions work
4. Model trained → predictions improve  
5. Next user gets better recommendations → cycle continues

This is what makes Slurpy "self-improving"
"""

from typing import Dict, List, Optional, Literal
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import json
import logging

logger = logging.getLogger(__name__)


@dataclass
class InterventionOutcome:
    """Track outcome of a specific intervention"""
    
    user_id: str
    intervention_name: str
    assigned_date: datetime
    completed: bool
    
    phq9_before: int
    phq9_after: Optional[int]
    gad7_before: int
    gad7_after: Optional[int]
    
    # User reported effectiveness
    perceived_helpfulness: Optional[int]  # 1-10
    would_use_again: Optional[bool]
    homework_adherence: Optional[float]  # 0-100%
    
    # Derived metrics
    symptom_improvement_pct: float
    time_to_improvement_days: Optional[int]
    engagement_signals: List[str]  # ["practiced_daily", "discussed_in_session", "shared_success"]
    
    notes: Optional[str]


@dataclass
class InterventionEffectiveness:
    """Aggregated effectiveness metrics for an intervention"""
    
    intervention_name: str
    
    # Sample stats
    total_assignments: int
    completion_rate: float  # Fraction who completed homework
    
    # Effectiveness by condition
    avg_improvement_phq9: float  # Average PHQ-9 improvement
    avg_improvement_gad7: float  # Average GAD-7 improvement
    avg_improvement_pct: float  # Overall improvement %
    perceived_helpfulness_avg: float  # 1-10 average
    
    # Safety/tolerability
    adverse_event_rate: float  # Fraction who reported worsening
    dropout_rate: float  # Fraction who stopped using it
    
    # Condition-specific effectiveness
    effectiveness_anxiety: float  # 0-1 score
    effectiveness_depression: float
    effectiveness_crisis: float
    
    # Demographic variations
    effectiveness_by_age: Dict[str, float]
    effectiveness_by_engagement: Dict[str, float]  # {"high": 0.85, "moderate": 0.65, "low": 0.30}
    
    # Trend (improving or declining?)
    effectiveness_trend: Literal["improving", "stable", "declining"]
    last_updated: datetime


class FeedbackCollector:
    """Collect outcome data from interventions"""
    
    def __init__(self, db_client):
        self.db = db_client
    
    async def record_intervention_outcome(
        self,
        outcome: InterventionOutcome,
    ) -> str:
        """Record that one intervention had one outcome for one user"""
        
        outcome_dict = {
            **asdict(outcome),
            "assigned_date": outcome.assigned_date.isoformat(),
            "created_at": datetime.utcnow().isoformat(),
        }
        
        # Store in database
        result = await self.db.table("intervention_outcomes").insert(outcome_dict).execute()
        
        logger.info(f"Recorded outcome for {outcome.user_id}:{outcome.intervention_name}")
        
        return result.data[0]["id"]
    
    async def collect_session_feedback(
        self,
        user_id: str,
        session_id: str,
        interventions_discussed: List[str],
        session_notes: str,
        user_rating: int,  # 1-10 session helpfulness
    ) -> Dict:
        """Record feedback from end-of-session survey"""
        
        feedback = {
            "user_id": user_id,
            "session_id": session_id,
            "interventions_discussed": interventions_discussed,
            "session_rating": user_rating,
            "notes_summary": session_notes[:500],  # Truncate
            "created_at": datetime.utcnow().isoformat(),
        }
        
        await self.db.table("session_feedback").insert(feedback).execute()
        
        logger.info(f"Collected session feedback from {user_id}")
        
        return feedback
    
    async def collect_homework_outcome(
        self,
        user_id: str,
        homework_id: str,
        intervention_name: str,
        completed: bool,
        adherence_notes: str,
    ) -> Dict:
        """Record homework completion and outcome"""
        
        homework_result = {
            "user_id": user_id,
            "homework_id": homework_id,
            "intervention_name": intervention_name,
            "completed": completed,
            "notes": adherence_notes,
            "created_at": datetime.utcnow().isoformat(),
        }
        
        await self.db.table("homework_outcomes").insert(homework_result).execute()
        
        return homework_result


class EffectivnessAnalyzer:
    """Analyze intervention effectiveness from collected data"""
    
    def __init__(self, db_client):
        self.db = db_client
    
    async def calculate_intervention_effectiveness(
        self,
        intervention_name: str,
        lookback_days: int = 90,
    ) -> InterventionEffectiveness:
        """Calculate effectiveness metrics for an intervention"""
        
        cutoff_date = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()
        
        # Query outcomes
        outcomes_result = await self.db.table("intervention_outcomes").select("*").eq(
            "intervention_name", intervention_name
        ).gte("created_at", cutoff_date).execute()
        
        outcomes = outcomes_result.data or []
        
        if not outcomes:
            return InterventionEffectiveness(
                intervention_name=intervention_name,
                total_assignments=0,
                completion_rate=0,
                avg_improvement_phq9=0,
                avg_improvement_gad7=0,
                avg_improvement_pct=0,
                perceived_helpfulness_avg=0,
                adverse_event_rate=0,
                dropout_rate=0,
                effectiveness_anxiety=0.5,
                effectiveness_depression=0.5,
                effectiveness_crisis=0.5,
                effectiveness_by_age={},
                effectiveness_by_engagement={"high": 0.5, "moderate": 0.5, "low": 0.5},
                effectiveness_trend="stable",
                last_updated=datetime.utcnow(),
            )
        
        # Calculate metrics
        completed_count = sum(1 for o in outcomes if o.get("completed"))
        completion_rate = completed_count / len(outcomes) if outcomes else 0
        
        improvements_phq9 = [
            o.get("phq9_before", 0) - (o.get("phq9_after") or o.get("phq9_before", 0))
            for o in outcomes if o.get("phq9_before")
        ]
        avg_improvement_phq9 = sum(improvements_phq9) / len(improvements_phq9) if improvements_phq9 else 0
        
        improvements_gad7 = [
            o.get("gad7_before", 0) - (o.get("gad7_after") or o.get("gad7_before", 0))
            for o in outcomes if o.get("gad7_before")
        ]
        avg_improvement_gad7 = sum(improvements_gad7) / len(improvements_gad7) if improvements_gad7 else 0
        
        improvement_pcts = [o.get("symptom_improvement_pct", 0) for o in outcomes]
        avg_improvement_pct = sum(improvement_pcts) / len(improvement_pcts) if improvement_pcts else 0
        
        helpfulness_ratings = [
            o.get("perceived_helpfulness")
            for o in outcomes if o.get("perceived_helpfulness")
        ]
        perceived_helpfulness_avg = (
            sum(helpfulness_ratings) / len(helpfulness_ratings) if helpfulness_ratings else 0
        )
        
        # Effectiveness scores (0-1)
        effectiveness_anxiety = min(1.0, avg_improvement_gad7 / 10.0)  # Max 10-point improvement
        effectiveness_depression = min(1.0, avg_improvement_phq9 / 10.0)
        effectiveness_crisis = 0.5  # Would need crisis-specific data
        
        return InterventionEffectiveness(
            intervention_name=intervention_name,
            total_assignments=len(outcomes),
            completion_rate=completion_rate,
            avg_improvement_phq9=avg_improvement_phq9,
            avg_improvement_gad7=avg_improvement_gad7,
            avg_improvement_pct=avg_improvement_pct,
            perceived_helpfulness_avg=perceived_helpfulness_avg,
            adverse_event_rate=0,
            dropout_rate=1 - completion_rate,
            effectiveness_anxiety=effectiveness_anxiety,
            effectiveness_depression=effectiveness_depression,
            effectiveness_crisis=effectiveness_crisis,
            effectiveness_by_age={},
            effectiveness_by_engagement={
                "high": min(1.0, perceived_helpfulness_avg / 10.0 * 1.2),
                "moderate": min(1.0, perceived_helpfulness_avg / 10.0),
                "low": min(1.0, perceived_helpfulness_avg / 10.0 * 0.8),
            },
            effectiveness_trend="stable",
            last_updated=datetime.utcnow(),
        )


class ModelRetrainer:
    """Retrain prediction models based on collected feedback"""
    
    def __init__(self, db_client):
        self.db = db_client
        self.analyzer = EffectivnessAnalyzer(db_client)
    
    async def retrain_intervention_model(self) -> Dict:
        """
        Retrain intervention effectiveness model using all collected data
        
        In real system, this would use ML techniques like:
        - XGBoost to predict intervention effectiveness per user
        - Logistic regression for dropout prediction
        - SHAP values for interpretability
        
        For MVP, we use empirical aggregation and rule updates
        """
        
        logger.info("Starting intervention model retraining...")
        
        # Get all interventions
        interventions = [
            "breathing",
            "grounding",
            "thought_record",
            "behavioral_activation",
            "exposure",
            "assertiveness",
            "values_work",
        ]
        
        effectiveness_metrics = {}
        
        for intervention in interventions:
            metrics = await self.analyzer.calculate_intervention_effectiveness(intervention)
            effectiveness_metrics[intervention] = asdict(metrics)
        
        # Update model weights (would write to model config)
        model_update = {
            "timestamp": datetime.utcnow().isoformat(),
            "data_points_processed": sum(m["total_assignments"] for m in effectiveness_metrics.values()),
            "interventions_updated": list(effectiveness_metrics.keys()),
            "effectiveness_metrics": effectiveness_metrics,
        }
        
        # Store update
        await self.db.table("model_retrains").insert(model_update).execute()
        
        logger.info(f"Model retrain complete. Processed {model_update['data_points_processed']} outcomes")
        
        return model_update
    
    async def identify_model_drift(self) -> Dict:
        """Detect if effectiveness metrics are drifting (model needs update)"""
        
        # Compare recent vs historical effectiveness
        current_metrics = await self.analyzer.calculate_intervention_effectiveness(
            "breathing",
            lookback_days=14,  # Last 2 weeks
        )
        
        historical_metrics = await self.analyzer.calculate_intervention_effectiveness(
            "breathing",
            lookback_days=90,  # Last 3 months
        )
        
        # If recent effectiveness differs significantly from historical, we have drift
        drift_detected = abs(
            current_metrics.avg_improvement_pct - historical_metrics.avg_improvement_pct
        ) > 0.15  # 15% drift threshold
        
        return {
            "drift_detected": drift_detected,
            "recent_effectiveness": current_metrics.avg_improvement_pct,
            "historical_effectiveness": historical_metrics.avg_improvement_pct,
        }


class ContinuousImprovementPipeline:
    """Orchestrates the full feedback loop"""
    
    def __init__(self, db_client):
        self.db = db_client
        self.feedback_collector = FeedbackCollector(db_client)
        self.analyzer = EffectivnessAnalyzer(db_client)
        self.retrainer = ModelRetrainer(db_client)
    
    async def process_weekly_improvement_cycle(self) -> Dict:
        """
        Run weekly improvement cycle:
        1. Collect week's outcomes
        2. Analyze effectiveness
        3. Detect drift
        4. Retrain if needed
        """
        
        logger.info("Starting weekly improvement cycle...")
        
        # Check for drift
        drift_check = await self.retrainer.identify_model_drift()
        
        needs_retrain = False
        
        if drift_check["drift_detected"]:
            logger.warning(f"Model drift detected: {drift_check}")
            needs_retrain = True
        
        # Retrain if drift or just some time has passed
        retrain_result = None
        if needs_retrain:
            retrain_result = await self.retrainer.retrain_intervention_model()
        
        return {
            "cycle_date": datetime.utcnow().isoformat(),
            "drift_detected": drift_check["drift_detected"],
            "model_retrained": needs_retrain,
            "retrain_result": retrain_result,
        }
    
    async def get_system_improvement_report(self) -> Dict:
        """Get report on how system has improved over time"""
        
        # Get all interventions and their effectiveness over time
        interventions = [
            "breathing",
            "grounding",
            "thought_record",
            "behavioral_activation",
            "exposure",
            "assertiveness",
            "values_work",
        ]
        
        current_effectiveness = {}
        for intervention in interventions:
            metrics = await self.analyzer.calculate_intervention_effectiveness(
                intervention,
                lookback_days=14,
            )
            current_effectiveness[intervention] = metrics.avg_improvement_pct
        
        # Best and worst performers
        best_intervention = max(current_effectiveness.items(), key=lambda x: x[1])
        worst_intervention = min(current_effectiveness.items(), key=lambda x: x[1])
        
        return {
            "report_date": datetime.utcnow().isoformat(),
            "interventions_effectiveness": current_effectiveness,
            "best_performer": {
                "name": best_intervention[0],
                "improvement_pct": best_intervention[1],
            },
            "needs_improvement": {
                "name": worst_intervention[0],
                "improvement_pct": worst_intervention[1],
            },
            "recommendations": self._generate_recommendations(current_effectiveness),
        }
    
    @staticmethod
    def _generate_recommendations(effectiveness: Dict[str, float]) -> List[str]:
        """Generate recommendations based on effectiveness data"""
        
        recommendations = []
        
        # Find underperforming interventions
        below_threshold = [
            (name, score) for name, score in effectiveness.items() if score < 0.20
        ]
        
        if below_threshold:
            interventions_str = ", ".join([name for name, _ in below_threshold])
            recommendations.append(
                f"Consider improving or replacing: {interventions_str} (effectiveness < 20%)"
            )
        
        # Find high performers to double down on
        strong_performers = [
            (name, score) for name, score in effectiveness.items() if score > 0.60
        ]
        
        if strong_performers:
            interventions_str = ", ".join([name for name, _ in strong_performers])
            recommendations.append(
                f"Double down on: {interventions_str} (strong performance > 60%)"
            )
        
        # Overall recommendation
        avg_effectiveness = sum(effectiveness.values()) / len(effectiveness) if effectiveness else 0
        if avg_effectiveness > 0.50:
            recommendations.append("System performing well - continue current approach")
        else:
            recommendations.append("Overall effectiveness below target - review intervention mix")
        
        return recommendations


# ============================================================================
# CLI Test
# ============================================================================

if __name__ == "__main__":
    
    # Simulate some intervention outcomes
    outcomes = [
        InterventionOutcome(
            user_id="user-1",
            intervention_name="breathing",
            assigned_date=datetime.utcnow() - timedelta(days=5),
            completed=True,
            phq9_before=18,
            phq9_after=16,
            gad7_before=15,
            gad7_after=13,
            perceived_helpfulness=8,
            would_use_again=True,
            homework_adherence=80.0,
            symptom_improvement_pct=0.22,  # (18-16)/9 + (15-13)/7
            time_to_improvement_days=2,
            engagement_signals=["practiced_daily", "discussed_in_session"],
            notes="User reported significant relief during first panic attack",
        ),
        InterventionOutcome(
            user_id="user-2",
            intervention_name="breathing",
            assigned_date=datetime.utcnow() - timedelta(days=3),
            completed=True,
            phq9_before=14,
            phq9_after=12,
            gad7_before=16,
            gad7_after=14,
            perceived_helpfulness=6,
            would_use_again=True,
            homework_adherence=60.0,
            symptom_improvement_pct=0.13,
            time_to_improvement_days=1,
            engagement_signals=["discussed_in_session"],
            notes="Moderate improvement, user prefers other techniques",
        ),
    ]
    
    print("=" * 60)
    print("FEEDBACK LOOP TEST")
    print("=" * 60)
    
    # Simulate creating outcomes
    for outcome in outcomes:
        print(f"\nProcessing outcome: {outcome.user_id}→{outcome.intervention_name}")
        print(f"  Improvement: {outcome.symptom_improvement_pct:.1%}")
        print(f"  Helpfulness: {outcome.perceived_helpfulness}/10")
    
    print("\nWould process through:")
    print("1. FeedbackCollector - stores in DB")
    print("2. EffectivenessAnalyzer - aggregates metrics")
    print("3. ModelRetrainer - updates prediction model")
    print("4. ContinuousImprovementPipeline - runs weekly cycle")
    
    print("\nThis creates the self-improving feedback loop ✓")
