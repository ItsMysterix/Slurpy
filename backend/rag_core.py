# -*- coding: utf-8 -*-
"""
therapy_specialized_bot.py — Mental health chatbot with therapeutic differentiation

What makes this different from generic AI:
1. Therapeutic training and evidence-based approaches
2. Mental health crisis detection and intervention
3. Therapeutic memory and progress tracking  
4. Specialized mental health knowledge base
5. Therapeutic relationship building
6. Mental health assessment capabilities
7. Therapeutic homework and exercises
"""

import os, json, datetime, sqlite3, uuid, re
from collections import deque
from typing import Deque, Tuple, List, Optional, Dict, Any
from contextlib import contextmanager

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from backend.memory import add_message, recall

load_dotenv()
History = Deque[Tuple[str, str, str]]

# Therapeutic knowledge base - this is what differentiates from generic AI
THERAPEUTIC_APPROACHES = {
    "cbt": {
        "name": "Cognitive Behavioral Therapy",
        "techniques": [
            "thought challenging", "behavioral activation", "exposure therapy", 
            "cognitive restructuring", "mindfulness", "grounding techniques"
        ],
        "suitable_for": ["anxiety", "depression", "panic", "phobias", "ocd"]
    },
    "dbt": {
        "name": "Dialectical Behavior Therapy", 
        "techniques": [
            "distress tolerance", "emotion regulation", "interpersonal effectiveness", 
            "mindfulness", "wise mind", "TIPP skills"
        ],
        "suitable_for": ["borderline personality", "emotional dysregulation", "self-harm", "suicidal ideation"]
    },
    "act": {
        "name": "Acceptance and Commitment Therapy",
        "techniques": [
            "values clarification", "psychological flexibility", "mindfulness", 
            "defusion techniques", "acceptance strategies"
        ],
        "suitable_for": ["chronic pain", "anxiety", "depression", "trauma"]
    }
}

# Mental health assessment questions (evidence-based)
ASSESSMENT_FRAMEWORKS = {
    "phq9_depression": [
        "Over the past two weeks, how often have you felt down, depressed, or hopeless?",
        "How often have you had little interest or pleasure in doing things?",
        "How has your sleep been affected?",
        "How have your energy levels been?"
    ],
    "gad7_anxiety": [
        "Over the past two weeks, how often have you felt nervous, anxious, or on edge?", 
        "How often have you been unable to stop or control worrying?",
        "How often have you had trouble relaxing?"
    ],
    "trauma_screening": [
        "Have you experienced any overwhelming or distressing events?",
        "Do you ever have unwanted memories or flashbacks?", 
        "How has your sleep been affected by difficult experiences?"
    ]
}

# Crisis intervention protocols
CRISIS_LEVELS = {
    "immediate": {
        "indicators": ["kill myself", "suicide", "end my life", "not worth living", "want to die"],
        "response": "immediate_intervention",
        "resources": {
            "us": "988 - Suicide & Crisis Lifeline",
            "text": "Text HOME to 741741 - Crisis Text Line", 
            "emergency": "911 or go to nearest emergency room"
        }
    },
    "elevated": {
        "indicators": ["hurt myself", "self-harm", "cutting", "can't cope", "overwhelmed"],
        "response": "safety_planning",
        "resources": {
            "warmline": "1-855-771-HELP (4357)",
            "online": "suicidepreventionlifeline.org/chat"
        }
    }
}

# Therapeutic exercises and homework
THERAPEUTIC_EXERCISES = {
    "anxiety": {
        "grounding_5_4_3_2_1": "Name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, 1 you can taste",
        "box_breathing": "Breathe in for 4, hold for 4, out for 4, hold for 4",
        "thought_challenging": "Ask: Is this thought helpful? Is it realistic? What would I tell a friend?"
    },
    "depression": {
        "behavioral_activation": "Schedule one small meaningful activity each day",
        "gratitude_practice": "Write down 3 specific things you're grateful for",
        "activity_monitoring": "Track your mood and activities to identify patterns"
    },
    "trauma": {
        "safe_place_visualization": "Imagine a place where you feel completely safe and calm",
        "grounding_techniques": "Focus on physical sensations to stay present",
        "container_exercise": "Visualize putting difficult memories in a strong container"
    }
}

class TherapyBot:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0.7,
            model_kwargs={"max_tokens": 500},
        )
        self.init_therapeutic_db()
    
    @contextmanager
    def get_db(self):
        conn = sqlite3.connect('therapy_bot.db')
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
    
    def init_therapeutic_db(self):
        """Initialize database with therapeutic tracking"""
        with self.get_db() as conn:
            # Therapeutic progress tracking
            conn.execute('''
                CREATE TABLE IF NOT EXISTS therapeutic_progress (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    session_date DATE NOT NULL,
                    presenting_concerns TEXT,
                    therapeutic_approach TEXT,
                    techniques_used TEXT,
                    homework_assigned TEXT,
                    progress_notes TEXT,
                    mood_rating INTEGER,
                    goals TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Crisis interventions log
            conn.execute('''
                CREATE TABLE IF NOT EXISTS crisis_interventions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    crisis_level TEXT NOT NULL,
                    intervention_provided TEXT,
                    resources_given TEXT,
                    follow_up_needed BOOLEAN,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Therapeutic goals and outcomes
            conn.execute('''
                CREATE TABLE IF NOT EXISTS therapeutic_goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    goal_description TEXT NOT NULL,
                    target_date DATE,
                    progress_rating INTEGER,
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
    
    def assess_crisis_level(self, message: str) -> Optional[str]:
        """Assess crisis level using clinical indicators"""
        message_lower = message.lower()
        
        for level, config in CRISIS_LEVELS.items():
            for indicator in config["indicators"]:
                if indicator in message_lower:
                    return level
        return None
    
    def provide_crisis_intervention(self, user_id: str, message: str, crisis_level: str) -> str:
        """Provide appropriate crisis intervention"""
        config = CRISIS_LEVELS[crisis_level]
        
        if crisis_level == "immediate":
            response = (
                "I'm very concerned about you right now. Your safety is the most important thing.\n\n"
                "IMMEDIATE HELP:\n"
                f"• {config['resources']['us']}\n"
                f"• {config['resources']['text']}\n"
                f"• {config['resources']['emergency']}\n\n"
                "Please reach out to one of these resources right now. You don't have to go through this alone."
            )
        else:
            response = (
                "I can hear that you're really struggling right now. Let's work on keeping you safe.\n\n"
                "SUPPORT RESOURCES:\n"
                f"• {config['resources']['warmline']}\n"
                f"• {config['resources']['online']}\n\n"
                "Would you like to work on a safety plan together?"
            )
        
        # Log crisis intervention
        with self.get_db() as conn:
            conn.execute(
                '''INSERT INTO crisis_interventions 
                   (user_id, crisis_level, intervention_provided, resources_given, follow_up_needed)
                   VALUES (?, ?, ?, ?, ?)''',
                (user_id, crisis_level, response, json.dumps(config['resources']), True)
            )
            conn.commit()
        
        return response
    
    def identify_therapeutic_needs(self, message: str, history: List[str]) -> Dict[str, Any]:
        """Identify what therapeutic approach might be helpful"""
        message_lower = message.lower()
        all_text = (message + " " + " ".join(history)).lower()
        
        needs = {
            "approaches": [],
            "assessment_needed": [],
            "exercises": []
        }
        
        # Identify suitable therapeutic approaches
        if any(word in all_text for word in ["anxious", "worry", "panic", "fear"]):
            needs["approaches"].append("cbt")
            needs["assessment_needed"].append("gad7_anxiety")
            needs["exercises"].extend(THERAPEUTIC_EXERCISES["anxiety"].keys())
        
        if any(word in all_text for word in ["depressed", "sad", "hopeless", "empty"]):
            needs["approaches"].append("cbt")
            needs["assessment_needed"].append("phq9_depression") 
            needs["exercises"].extend(THERAPEUTIC_EXERCISES["depression"].keys())
        
        if any(word in all_text for word in ["trauma", "flashback", "triggered", "abuse"]):
            needs["approaches"].append("act")
            needs["assessment_needed"].append("trauma_screening")
            needs["exercises"].extend(THERAPEUTIC_EXERCISES["trauma"].keys())
        
        return needs
    
    def suggest_therapeutic_exercise(self, concern_type: str) -> str:
        """Suggest specific therapeutic exercise"""
        if concern_type not in THERAPEUTIC_EXERCISES:
            return "Let's work on some mindfulness techniques together."
        
        exercises = THERAPEUTIC_EXERCISES[concern_type]
        # Pick the most appropriate exercise (simplified selection)
        exercise_name = list(exercises.keys())[0]
        exercise_description = exercises[exercise_name]
        
        return f"Let's try a {exercise_name.replace('_', ' ')} exercise: {exercise_description}"
    
    def build_therapeutic_prompt(self, message: str, history: History, user_id: str, therapeutic_needs: Dict) -> str:
        """Build prompt with therapeutic expertise"""
        
        # Get relevant therapeutic context
        relevant_memories = recall(user_id, message, k=3)
        memory_context = ""
        if relevant_memories:
            memory_context = f"Previous therapeutic context: {' | '.join(relevant_memories[:2])}\n\n"
        
        # Build conversation history
        recent_history = ""
        if history:
            recent = list(history)[-3:]
            for user_msg, bot_msg, _ in recent:
                recent_history += f"Client: {user_msg}\nTherapist: {bot_msg}\n"
        
        # Therapeutic approach guidance
        approach_guidance = ""
        if therapeutic_needs["approaches"]:
            approaches = [THERAPEUTIC_APPROACHES[app]["name"] for app in therapeutic_needs["approaches"]]
            approach_guidance = f"Consider using techniques from: {', '.join(approaches)}\n"
        
        prompt = f"""You are a specialized mental health support chatbot with training in evidence-based therapeutic approaches.

THERAPEUTIC CONTEXT:
{memory_context}{approach_guidance}

RECENT SESSION:
{recent_history}

CURRENT CLIENT MESSAGE: "{message}"

THERAPEUTIC GUIDELINES:
1. Use evidence-based therapeutic techniques when appropriate
2. Maintain therapeutic boundaries while being warm and supportive  
3. Assess for therapeutic needs and suggest relevant interventions
4. Never diagnose, but help clients understand their experiences
5. Provide psychoeducation when helpful
6. Suggest therapeutic exercises or homework when appropriate
7. Build therapeutic rapport and track progress over time
8. Respond to what the client actually shares - no assumptions
9. Use reflective listening and therapeutic questioning techniques
10. Maintain hope while validating difficulties

SPECIALIZATION: You have expertise in CBT, DBT, ACT, trauma-informed care, crisis intervention, and mental health assessment.

Respond as a skilled mental health professional would:"""
        
        return prompt
    
    def generate_therapeutic_response(self, message: str, history: History, user_id: str) -> Tuple[str, str, str]:
        """Generate response with therapeutic specialization"""
        
        # Crisis assessment first (safety priority)
        crisis_level = self.assess_crisis_level(message)
        if crisis_level:
            crisis_response = self.provide_crisis_intervention(user_id, message, crisis_level)
            history.append((message, crisis_response, "crisis"))
            return crisis_response, "crisis", "emergency"
        
        # Identify therapeutic needs
        recent_messages = [msg for msg, _, _ in list(history)[-5:]]
        therapeutic_needs = self.identify_therapeutic_needs(message, recent_messages)
        
        # Build therapeutic prompt
        prompt = self.build_therapeutic_prompt(message, history, user_id, therapeutic_needs)
        
        try:
            response = str(self.llm.invoke(prompt).content).strip()
            
            # Add therapeutic exercise if appropriate
            if therapeutic_needs["exercises"] and any(word in message.lower() for word in ["help", "what can i do", "suggestions"]):
                main_concern = therapeutic_needs["exercises"][0].split("_")[0]  # Extract main concern
                exercise = self.suggest_therapeutic_exercise(main_concern)
                response += f"\n\n{exercise}"
            
            # Log therapeutic progress
            self.log_therapeutic_progress(user_id, message, response, therapeutic_needs)
            
            history.append((message, response, "therapeutic"))
            if len(history) > 8:
                history.popleft()
            
            return response, "therapeutic", "therapy"
            
        except Exception as e:
            fallback = "I'm experiencing some technical difficulties. How are you feeling right now, and what would be most helpful?"
            history.append((message, fallback, "neutral"))
            return fallback, "neutral", "neutral"
    
    def log_therapeutic_progress(self, user_id: str, message: str, response: str, needs: Dict):
        """Log therapeutic session for progress tracking"""
        with self.get_db() as conn:
            conn.execute(
                '''INSERT INTO therapeutic_progress 
                   (user_id, session_date, presenting_concerns, therapeutic_approach, techniques_used, progress_notes)
                   VALUES (?, ?, ?, ?, ?, ?)''',
                (user_id, datetime.date.today(), message, 
                 json.dumps(needs["approaches"]), json.dumps(needs["exercises"]), response[:500])
            )
            conn.commit()

# Streaming support for API
def build_therapeutic_stream_prompt(message: str, history: History, user_id: str) -> Dict[str, Any]:
    """Build streaming prompt with therapeutic specialization"""
    bot = TherapyBot()
    
    crisis_level = bot.assess_crisis_level(message)
    if crisis_level:
        return {
            "is_crisis": True,
            "crisis_level": crisis_level,
            "crisis_response": bot.provide_crisis_intervention(user_id, message, crisis_level)
        }
    
    recent_messages = [msg for msg, _, _ in list(history)[-5:]]
    therapeutic_needs = bot.identify_therapeutic_needs(message, recent_messages)
    prompt = bot.build_therapeutic_prompt(message, history, user_id, therapeutic_needs)
    
    return {
        "is_crisis": False,
        "full_prompt": prompt,
        "therapeutic_needs": therapeutic_needs,
        "user_id": user_id
    }

# Main interface
def therapeutic_response(message: str, history: History, user_id: str = "anonymous") -> Tuple[str, str, str]:
    """Main function for therapeutic chat responses"""
    bot = TherapyBot()
    return bot.generate_therapeutic_response(message, history, user_id)

if __name__ == "__main__":
    print("Therapeutic Mental Health Chatbot")
    print("Specialized in evidence-based therapeutic approaches")
    
    bot = TherapyBot()
    history: History = deque()
    user_id = "test_user"
    
    while True:
        try:
            user_input = input("\nYou: ").strip()
            
            if user_input.lower() in ["quit", "exit"]:
                break
            
            response, emotion, category = bot.generate_therapeutic_response(user_input, history, user_id)
            print(f"\nTherapist: {response}")
            
        except KeyboardInterrupt:
            break
    
    print("\nThank you for the session. Take care of yourself.")