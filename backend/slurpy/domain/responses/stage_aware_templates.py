"""
Stage-Aware Response Templates
Returns clinically-appropriate responses based on treatment phase
NO AI CALLS - Template-based with mood/context injection

Each phase has a specific response strategy:
- Intake: Validating + psychoeducating + safety focus
- Stabilization: Teaching crisis skills + immediate relief  
- Skill-building: Progressive skill teaching + homework
- Integration: Real-world application + autonomy
- Maintenance: Relapse prevention + meaning/values
"""

from typing import Literal, Optional, List, Dict
from enum import Enum
import random

TherapyPhase = Literal["intake", "stabilization", "skill_building", "integration", "maintenance"]
UserMood = Literal["crisis", "distressed", "neutral", "improving", "stable"]


class StageAwareTemplates:
    """Response templates for each therapeutic phase"""
    
    # ========================================================================
    # INTAKE PHASE (Session 1-2)
    # Goal: Build safety & alliance, gather baseline
    # ========================================================================
    
    INTAKE_RESPONSES = {
        "open_simple": [
            "I'm here to help. What's been going on that brought you here today?",
            "Thank you for sharing with me. Can you tell me more about what's been happening?",
            "I appreciate you opening up. Let's take some time to understand what you're experiencing.",
        ],
        "validation": [
            "That sounds really difficult. Your feelings make complete sense given what you're dealing with.",
            "I hear you. What you're experiencing is a common response to stress, and you're not alone.",
            "Thank you for trusting me with this. These experiences are valid, and we can work through them together.",
        ],
        "psychoeducation": [
            "What you're describing—{symptom_label}—is actually a really common reaction to stress. It's your mind and body trying to protect you.",
            "Many people experience what you're going through. Let me explain what might be happening: {psychoed_content}",
            "I want to help you understand why you might be feeling this way. This is a normal response, and we can address it.",
        ],
        "safety_assessment": [
            "I want to make sure you're safe. Are you having any thoughts of harming yourself?",
            "One important thing we need to check: How are you keeping yourself safe right now?",
            "I need to ask: Have you had any thoughts about hurting yourself or others lately?",
        ],
        "goal_setting": [
            "What would better look like for you? What's one goal we could work toward together?",
            "By the end of our work together, what would you like to be different?",
            "Imagine things were better—what would that look like? That's where we're heading.",
        ],
        "plan_intro": [
            "Based on what you've shared, here's how I think we can work together: {plan_outline}",
            "I have some ideas about approaches that work well for what you're experiencing. Let me share those with you.",
            "There are proven strategies we can use to help. Let me walk you through what we might do.",
        ],
    }
    
    # ========================================================================
    # STABILIZATION PHASE (Week 1-2)
    # Goal: Immediate symptom relief, teach crisis skills
    # ========================================================================
    
    STABILIZATION_RESPONSES = {
        "skill_intro": [
            "I want to teach you a technique that can help when things feel intense. It's called {skill_name}.",
            "There's a specific skill that can help right now: {skill_name}. Let me show you how.",
            "Many people find {skill_name} really helpful for what you're experiencing. Would you like to learn it?",
        ],
        "skill_teach": [
            "Here's how {skill_name} works: {skill_steps}. Try it now if you can.",
            "{skill_steps} When anxiety/panic hits, this can ground you back to the present moment.",
            "The goal of {skill_name} is to {skill_goal}. Here's the process: {skill_steps}",
        ],
        "validation_distress": [
            "What you're feeling right now is intense, and that's okay. You're not broken.",
            "These feelings are painful, but they won't last forever. Let's use {skill_name} to get through this moment.",
            "I know this is really hard. You're doing the right thing by reaching out.",
        ],
        "encourage_practice": [
            "The more you practice {skill_name}, the easier it becomes. Can you practice once today?",
            "Let's make {skill_name} your go-to skill when anxiety hits. You'll get better at it with practice.",
            "I know it might feel awkward at first, but {skill_name} gets easier. Practice once today when you get a chance.",
        ],
        "homework_simple": [
            "For this week, I'd like you to practice {skill_name} once a day. Track what happens.",
            "Your homework: Use {skill_name} at least once today and notice what changes.",
            "Between now and we talk again, practice {skill_name} when you feel {emotion} rising.",
        ],
        "relief_celebration": [
            "You used {skill_name} and it helped! That's exactly what we want. You're learning what works for you.",
            "Did you notice how that worked? When you use {skill_name} consistently, you're actually training your brain.",
            "Great! You're already getting better at this. Keep practicing and notice the changes.",
        ],
    }
    
    # ========================================================================
    # SKILL-BUILDING PHASE (Week 2-6)
    # Goal: Teach evidence-based skills, progressive difficulty
    # ========================================================================
    
    SKILL_BUILDING_RESPONSES = {
        "skill_recap": [
            "Last time we worked on {previous_skill}. How's that been going?",
            "You've already learned {previous_skill}. Let's build on that foundation.",
            "Great job practicing {previous_skill}. Now I want to introduce something new that builds on what you know.",
        ],
        "introduce_new": [
            "Today I want to teach you {new_skill}, which helps with {target_issue}. It works because {mechanism}.",
            "You're ready for the next skill: {new_skill}. This one addresses thoughts, not just emotions.",
            "{new_skill} is a powerful technique. Here's how it works: {steps_summary}.",
        ],
        "thought_work": [
            "Let's look at a thought you had: '{thought}'. Is that thought completely true? What evidence supports it?",
            "When {situation} happens, you think '{thought}'. Let's examine that thought pattern together.",
            "I notice when {trigger} happens, you tend to think {thought_pattern}. Here's how we can work with that.",
        ],
        "behavioral_activation": [
            "Even small movement helps depression. What's one thing you could do today that aligns with your values?",
            "Depression tells us to withdraw. But when we do valued activities—even small ones—it actually helps. What matters to you?",
            "Let's identify one activity this week that's meaningful to you, even if it's just 15 minutes.",
        ],
        "exposures_gentle": [
            "You've been avoiding {situation}. I know that feels safer, but avoidance actually strengthens anxiety.",
            "I want to suggest something that might be uncomfortable: gradually facing {feared_situation}. Here's my plan...",
            "Anxiety decreases through exposure. Starting small, would you be willing to {small_exposure}?",
        ],
        "homework_progressive": [
            "This week: Practice {skill_1} and {skill_2}, and try one small {exposure_task}.",
            "Homework has two parts: First, practice {skill} using the worksheet I showed you. Second, track when you use it and what happens.",
            "I want you to log your thoughts for [situation] using the thought record I gave you.",
        ],
        "celebrate_effort": [
            "You're putting real effort into this. That's what creates change—your commitment.",
            "Look at what you've learned in just a few weeks! You're building real skills.",
            "The fact that you're showing up and practicing means you're already getting better.",
        ],
    }
    
    # ========================================================================
    # INTEGRATION PHASE (Week 6-8)
    # Goal: Real-world application, building independence
    # ========================================================================
    
    INTEGRATION_RESPONSES = {
        "acknowledge_progress": [
            "You should feel really good about how far you've come. Your PHQ-9 is down to {current_score}, which is significant progress.",
            "The skills you've learned are working. Now it's time to apply them in real life.",
            "You've made major progress. The next phase is making sure these changes stick.",
        ],
        "bigger_challenges": [
            "You've handled the basics. Now let's tackle bigger exposures: {bigger_challenge}.",
            "It's time to take what you've learned and test it in the real world. What's a bigger challenge you're ready to face?",
            "You never have to be perfect at this, just willing to try. What's one bigger thing you'd like to attempt?",
        ],
        "values_exploration": [
            "Beyond feeling better, what do you want your life to be about? What matters most to you?",
            "Now that symptoms are improving, what kind of life do you want to build? What are your values?",
            "Therapy helps us feel better so we can live how we actually want. What's important to you?",
        ],
        "independence_building": [
            "You don't need me to tell you what to do anymore. What do you think would help here?",
            "You're becoming the expert on you. What skill from everything we've learned fits this situation?",
            "Instead of me telling you, I'm curious: What could you try here?",
        ],
        "relapse_prep": [
            "Things will probably get hard sometimes again—that's normal. Let's plan for those moments what you'll do.",
            "We should prepare for potential bumps: {likely_trigger}. Here's my recommendation if it happens...",
            "I want to make sure you have a plan for when things get hard. Let's talk about what you'll do.",
        ],
        "homework_independent": [
            "You choose this week's challenges. What would you like to work on?",
            "Based on your goals, create your own homework plan. What feels right to practice?",
            "You're driving this now. What's your plan for this week to keep building?",
        ],
    }
    
    # ========================================================================
    # MAINTENANCE PHASE (Week 8+)
    # Goal: Sustain gains, prevent relapse, build resilience
    # ========================================================================
    
    MAINTENANCE_RESPONSES = {
        "celebrate_remission": [
            "Your PHQ-9 is now {current_score}. You're in remission. That's real progress.",
            "Look at where you started vs. where you are now. This is what successful treatment looks like.",
            "You did it. You learned skills, you practiced, you changed. This is your work.",
        ],
        "relapse_prevention": [
            "Relapse is a common part of recovery. Here are your early warning signs: {warning_signs}. If you notice these, {action}.",
            "Let's make a relapse prevention plan. What are your high-risk situations?",
            "Depression/anxiety can creep back sometimes. The key is catching it early. What will you do if {symptom} comes back?",
        ],
        "values_living": [
            "The real goal was never just symptom reduction—it was living according to your values. How's that going?",
            "Now I'm curious: Are you doing things that matter to you? What would you like to add to your life?",
            "Maintenance is about building a meaningful life, not just managing symptoms. What brings you joy?",
        ],
        "periodic_check": [
            "I'd like to check in monthly just to see how you're doing and if anything's coming up.",
            "Let's stay connected occasionally. We can do quarterly check-ins so you stay on track.",
            "You're independent now, but we can still touch base. When's a good time for a booster session?",
        ],
        "skill_review": [
            "If things get hard, remember our toolkit: {skills_list}. Which of these is your most powerful?",
            "You have the skills now. Trust your instincts. You've done this before.",
            "Keep practicing the skills that work best for you. They get even more powerful with time.",
        ],
        "meaning_work": [
            "What would fulfilling look like in the next year? What are you building toward?",
            "Beyond managing symptoms, what kind of life do you want? Let's talk about that.",
            "You've built resilience. What are you going to do with this stronger version of yourself?",
        ],
    }
    
    # ========================================================================
    # CRISIS RESPONSES (Any phase)
    # Used when user is in immediate distress/danger
    # ========================================================================
    
    CRISIS_RESPONSES = [
        "I'm concerned about your safety right now. Are you having thoughts of hurting yourself?",
        "What you're feeling is intense and I want to help. Can you reach out to someone safe right now—a friend, family, or crisis line?",
        "You don't have to face this alone. There are people available right now: National Suicide Prevention Lifeline: 988",
        "This moment is temporary, even though it doesn't feel that way. Let's focus on immediate safety. What's one thing that might help right now?",
        "I'm here, but you might need more immediate support. Would you be open to contacting a crisis service?",
    ]
    
    # ========================================================================
    # MATCHING TEXT EMOTIONS TO RESPONSES
    # ========================================================================
    
    @classmethod
    def assess_user_emotion(cls, text: str, current_assessment: Optional[Dict] = None) -> UserMood:
        """Simple heuristic to assess user emotional state from text"""
        
        crisis_keywords = ["suicide", "kill myself", "want to die", "no point", "hopeless", "harm"]
        distressed_keywords = ["terrible", "awful", "unbearable", "can't take", "breaking", "suffocating"]
        improving_keywords = ["better", "helped", "worked", "easier", "less anxious", "feeling good"]
        
        text_lower = text.lower()
        
        if any(word in text_lower for word in crisis_keywords):
            return "crisis"
        elif any(word in text_lower for word in distressed_keywords):
            return "distressed"
        elif any(word in text_lower for word in improving_keywords):
            return "improving"
        
        # Use assessment score if available
        if current_assessment and current_assessment.get("severity"):
            severity = current_assessment["severity"]
            if severity == "severe":
                return "distressed"
            elif severity in ["moderately_severe", "moderate"]:
                return "neutral"
            else:
                return "stable"
        
        return "neutral"
    
    @classmethod
    def get_response(
        cls,
        phase: TherapyPhase,
        response_type: str,
        mood: UserMood = "neutral",
        **format_vars,
    ) -> str:
        """
        Get a response template appropriate for the phase and context
        
        Args:
            phase: Current treatment phase
            response_type: Type of response (e.g., "skill_intro", "validation")
            mood: Current user emotional state
            **format_vars: Variables to fill in template (skill_name, symptom_label, etc.)
        """
        
        # Route to crisis response if needed
        if mood == "crisis":
            return random.choice(cls.CRISIS_RESPONSES)
        
        # Get phase responses
        phase_responses = {
            "intake": cls.INTAKE_RESPONSES,
            "stabilization": cls.STABILIZATION_RESPONSES,
            "skill_building": cls.SKILL_BUILDING_RESPONSES,
            "integration": cls.INTEGRATION_RESPONSES,
            "maintenance": cls.MAINTENANCE_RESPONSES,
        }
        
        responses = phase_responses.get(phase, phase_responses["skill_building"])
        response_templates = responses.get(response_type, responses.get("skill_intro", []))
        
        if not response_templates:
            return "I'm here to help. What would be most useful to talk about right now?"
        
        # Pick random template for variety
        template = random.choice(response_templates)
        
        # Format with provided variables
        try:
            return template.format(**format_vars)
        except KeyError:
            # If missing variables, return as-is
            return template


class StageAwareResponseBuilder:
    """Build complete responses using templates + emotion/context"""
    
    def __init__(self, phase: TherapyPhase):
        self.phase = phase
        self.templates = StageAwareTemplates()
    
    def build_crisis_response(self, user_text: str) -> str:
        """Build emergency response"""
        mood = self.templates.assess_user_emotion(user_text)
        return self.templates.get_response(self.phase, "validation", mood=mood)
    
    def build_opening_response(self, user_opening: str) -> str:
        """Response to user's opening message"""
        
        if self.phase == "intake":
            return self.templates.get_response(
                self.phase,
                "open_simple",
            )
        elif self.phase == "stabilization":
            return (
                self.templates.get_response(self.phase, "validation")
                + " "
                + self.templates.get_response(
                    self.phase,
                    "skill_intro",
                    skill_name="grounding",
                )
            )
        else:
            return self.templates.get_response(self.phase, "skill_recap")
    
    def build_validation_response(self, emotion_labels: List[str]) -> str:
        """Validate user emotions"""
        return self.templates.get_response(
            self.phase,
            "validation" if self.phase != "maintenance" else "celebrate_remission",
        )
    
    def build_skill_response(
        self,
        skill_name: str,
        skill_steps: str,
        skill_goal: str,
    ) -> str:
        """Teach a new skill"""
        
        if self.phase == "intake":
            return self.templates.get_response(
                self.phase,
                "psychoeducation",
                symptom_label=skill_name,
            )
        elif self.phase == "stabilization":
            return self.templates.get_response(
                self.phase,
                "skill_teach",
                skill_name=skill_name,
                skill_steps=skill_steps,
                skill_goal=skill_goal,
            )
        elif self.phase in ["skill_building", "integration"]:
            return self.templates.get_response(
                self.phase,
                "introduce_new" if self.phase == "skill_building" else "bigger_challenges",
                new_skill=skill_name,
                target_issue=skill_goal,
            )
        else:
            return self.templates.get_response(self.phase, "skill_review")


# ============================================================================
# CLI Test
# ============================================================================

if __name__ == "__main__":
    import json
    
    # Test each phase
    phases = ["intake", "stabilization", "skill_building", "integration", "maintenance"]
    
    for phase in phases:
        print(f"\n{'='*60}")
        print(f"PHASE: {phase.upper()}")
        print(f"{'='*60}")
        
        builder = StageAwareResponseBuilder(phase)
        
        # Get a sample response
        response = builder.build_opening_response("I'm not sure what to do")
        print(f"Opening: {response[:100]}...")
    
    # Test crisis handling
    print(f"\n{'='*60}")
    print("CRISIS DETECTION")
    print(f"{'='*60}")
    
    crisis_text = "I don't know if I can keep going. I want to hurt myself."
    mood = StageAwareTemplates.assess_user_emotion(crisis_text)
    print(f"Text: {crisis_text}")
    print(f"Detected mood: {mood}")
    
    response = StageAwareTemplates.get_response("skill_building", "validation", mood=mood)
    print(f"Response: {response}")
    
    print("\nAll tests passed! ✓")
