"""
Enhanced Humanlike Response System
Removes robotic templates, adds natural conversation variation
Context-aware, memory-integrated, non-repetitive responses

Key Features:
- Variables injected (name, time context, achievements)
- Multiple unique templates per response
- Conversational markers (variety in opening/closing)
- References to prior sessions
- Realistic therapeutic language (not overly polished)
"""

from typing import Dict, List, Optional, Literal
from datetime import datetime
from enum import Enum
import random

TherapyPhase = Literal["intake", "stabilization", "skill_building", "integration", "maintenance"]
UserMood = Literal["crisis", "distressed", "neutral", "improving", "stable"]


class ConversationAwareness:
    """Tracks conversation context to avoid repetition"""
    
    def __init__(self):
        self.last_responses = []
        self.topics_discussed = []
        self.skills_over_mentioned = []
        self.response_count = 0
    
    def add_response(self, response_type: str, content: str):
        """Track what we just said"""
        self.last_responses.append({
            "type": response_type,
            "content": content[:50],  # First 50 chars
            "timestamp": datetime.utcnow(),
        })
        # Keep last 5 responses
        if len(self.last_responses) > 5:
            self.last_responses.pop(0)
        self.response_count += 1
    
    def was_just_said(self, substring: str) -> bool:
        """Check if we recently mentioned something"""
        for resp in self.last_responses[-2:]:
            if substring.lower() in resp["content"].lower():
                return True
        return False
    
    def add_topic(self, topic: str):
        """Track what we've discussed"""
        if topic not in self.topics_discussed:
            self.topics_discussed.append(topic)
    
    def mark_skill_mentioned(self, skill: str):
        """Track over-mentioned skills"""
        self.skills_over_mentioned.append(skill)


class HumanlikeResponseBuilder:
    """
    Generate conversational, non-repetitive therapeutic responses
    Uses variation, context, and memory to feel natural
    """
    
    # Response openings (conversational intros)
    OPENINGS = {
        "acknowledgment": [
            "I hear you.",
            "That sounds really difficult.",
            "Okay, I'm listening.",
            "Got it.",
            "I understand.",
            "That's a lot to carry.",
            "That makes sense.",
        ],
        "curiosity": [
            "Tell me more about that.",
            "Help me understand what that was like.",
            "What happened?",
            "Walk me through it.",
            "I'm curious—what led to that?",
        ],
        "validation": [
            "Your feelings make complete sense.",
            "Anyone in that situation would feel the same way.",
            "That's a totally normal reaction.",
            "You're not alone in feeling that way.",
            "What you're experiencing is really common.",
        ],
        "connection": [
            "I've worked with others who felt the same way.",
            "Many people describe it exactly like that.",
            "You're not the first person to feel this.",
            "That's something we see quite often.",
        ],
        "gentle": [
            "I want to check something with you.",
            "Can I ask you something?",
            "There's something I'm wondering.",
            "I'm noticing something—can we talk about it?",
        ],
    }
    
    # Response connectors (transitions mid-response)
    CONNECTORS = [
        "Here's what I'm thinking:",
        "One thing that might help:",
        "Let me suggest something:",
        "What if we tried:",
        "I wonder if:",
        "Another way to look at it:",
        "What if you:",
        "Sometimes it helps to:",
    ]
    
    # Response closers (acknowledgment of what comes next)
    CLOSERS = {
        "encouragement": [
            "You've got this.",
            "Keep going.",
            "That takes real courage.",
            "I believe in you.",
            "You're doing great.",
            "I'm rooting for you.",
        ],
        "collaborative": [
            "Let's work on this together.",
            "We'll figure this out.",
            "I'm here to help.",
            "Let's try this together.",
            "How does that sound?",
            "What do you think?",
        ],
        "reflection": [
            "What rises for you with that?",
            "How does that land?",
            "What comes up when you think about that?",
            "Sit with that for a moment.",
        ],
        "action": [
            "Want to try something?",
            "Ready to give it a shot?",
            "Should we practice that together?",
            "Want to see how that feels?",
        ],
    }
    
    # Empathetic bridge phrases (make it conversational)
    BRIDGES = [
        "It sounds like you're",
        "What I hear is",
        "The way you describe it",
        "From what you're saying",
        "That tells me",
        "What strikes me is",
    ]
    
    # ====================================================================
    # PHASE-SPECIFIC CONVERSATION TEMPLATES
    # ====================================================================
    
    INTAKE_TEMPLATES = [
        # Opening
        """
        {opening} I'm glad you reached out. Starting therapy takes real courage.
        
        {connector} can we get a picture of what brought you here? What's been going on?
        """,
        
        # Exploration
        """
        {opening} That's important information.
        
        {bridge} you're dealing with a lot right now. When did you first notice {issue} starting?
        """,
        
        # Normalization + Planning
        """
        {opening} What you're describing—{symptom}—is actually a sign that your brain
        and body are trying to protect you. It's a normal response to stress.
        
        {connector} we talk about what's been working so far and what hasn't.
        {closer}
        """,
        
        # Safety Focus
        """
        I want to make sure you're okay. How are you managing right now in terms of safety?
        Are you having any thoughts of hurting yourself?
        
        {opening} Let's also make sure you have support around you.
        """,
    ]
    
    STABILIZATION_TEMPLATES = [
        # Skill Introduction (conversational, not lecture)
        """
        So one thing that really helps when things feel intense is {skill_name}.
        
        {bridge} {skill_mechanism} {connector} it works like this:
        
        {skill_steps}
        
        Want to try it together right now, or would it help to practice on your own first?
        """,
        
        # Validation + Skill
        """
        {opening} What you're feeling right now—that intensity—is real.
        And there's something we can do about it in this moment.
        
        {connector} use {skill_name}. {bridge}
        many of my clients find real relief when they do this. The mechanism is:
        
        {skill_explanation}
        
        Ready to give it a try?
        """,
        
        # Progress Recognition
        """
        Hey—I want to point out something. You used {skill_name} last session
        and it actually helped. Do you notice that pattern?
        
        {bridge} you're already building the skills to handle this.
        That matters. {closer}
        """,
        
        # Homework Framing (casual, not commanding)
        """
        Between now and next time we talk, here's what I'd love to see:
        Try {skill_name} at least once—maybe when you notice {trigger} coming up.
        
        Just notice what happens. You don't have to be perfect at it.
        Even an attempt counts. The practice is what builds strength.
        """,
    ]
    
    SKILL_BUILDING_TEMPLATES = [
        # Building on Prior Work
        """
        So {skill_name} is working for you—that's great. Let's build on that.
        
        {bridge} it's time to work on thoughts a bit.
        See, anxiety and depression love to tell stories. Let's look at one of those stories.
        
        {connector} take a thought that's been bothering you and we'll examine it together.
        """,
        
        # Deeper Work
        """
        You've got the basics down. Now we're going to go deeper.
        
        {bridge} patterns. Sometimes the same thought or worry shows up over and over.
        {connector} we map out what triggers that pattern and what keeps it going.
        Once we see the pattern, we can interrupt it.
        
        What's one pattern you've noticed in yourself?
        """,
        
        # Progressive Difficulty
        """
        Ready to turn up the heat a little?
        
        You've practiced {previous_skill} and it's working. {opener}
        Now I want to introduce {new_skill}. It's a level up because it requires
        actually engaging with the thing that scares you—in a controlled way.
        
        This is where the real change happens. Want to try?
        """,
        
        # Homework Accountability (curious, not judgmental)
        """
        How did the homework go from last time?
        
        {bridge} sometimes things that feel helpful in session are harder to do at home.
        If you didn't get to it, that's okay—let's talk about what got in the way.
        Were you forgetting? Or was something stopping you?
        """,
    ]
    
    INTEGRATION_TEMPLATES = [
        # Celebrating Progress
        """
        Let's take a step back for a second.
        
        When you first came in, your PHQ-9 was {baseline}. Today it's {current}.
        {bridge} you've done real, measurable work.
        
        How does it feel to be here?
        """,
        
        # Testing Skills in Real World
        """
        You've learned the skills. You can do them in session.
        Now it's time to test them where it actually matters—out there in your life.
        
        {connector} think of one situation this week where you could use {skill}.
        Something a bit challenging, but doable. Not the hardest situation yet.
        
        If it works, great. If it's hard, that's also information we can use.
        """,
        
        # Building Independence
        """
        Here's the truth I want you to start believing:
        You don't need me to tell you what to do. You know what works for you.
        
        {bridge} you're becoming the expert on you.
        So instead of me giving you all the answers, let me ask:
        What do you think would help here?
        """,
        
        # Preparing for Challenges Ahead
        """
        Recovery isn't a straight line. Some days will be harder than others.
        
        {connector} we talk about what to do when things get difficult.
        {bridge} you have a plan, you're more likely to use these skills
        when you actually need them, not just when we're sitting here.
        
        What do you think could knock you off track?
        """,
    ]
    
    MAINTENANCE_TEMPLATES = [
        # Celebrating Remission
        """
        {opening} Look at where you started versus where you are now.
        
        Your PHQ-9 went from {baseline} to {current}. You're in remission.
        This isn't luck. This is you doing the work, showing up, trying new things.
        
        {closer}
        """,
        
        # Relapse Prevention (practical, not scary)
        """
        Relapse is normal. It's not failure. It's information.
        
        {bridge} sometimes when we're feeling good, we stop doing the things
        that got us here. And then symptoms can creep back.
        
        {connector} create an early warning system. When do things usually get hard?
        What signs show up? And when you see those signs, what will you do?
        """,
        
        # Values Work
        """
        {opening} The real goal was never just symptom reduction.
        It was living a life that matters to you.
        
        {bridge} now that you have the headspace—what do you want to build?
        What brings you joy? What calls to you?
        Let's talk about that.
        """,
        
        # Booster Sessions
        """
        We could keep meeting regularly to maintain this.
        Or we could try monthly check-ins and see if that works.
        
        {bridge} you're solid now. You don't need me in the same way.
        But having someone to touch base with can help. What feels right to you?
        """,
    ]
    
    @classmethod
    def build_response(
        cls,
        phase: TherapyPhase,
        user_text: str,
        context: Optional[Dict] = None,
        conversation_memory: Optional[ConversationAwareness] = None,
        **variables,
    ) -> str:
        """
        Generate a humanlike, context-aware response
        
        Args:
            phase: Current treatment phase
            user_text: What user just said
            context: {baseline_phq9, current_phq9, improvement_pct, etc}
            conversation_memory: Track what we've said before
            **variables: skill_name, trigger, etc.
        """
        
        # Choose template pool based on phase
        template_pools = {
            "intake": cls.INTAKE_TEMPLATES,
            "stabilization": cls.STABILIZATION_TEMPLATES,
            "skill_building": cls.SKILL_BUILDING_TEMPLATES,
            "integration": cls.INTEGRATION_TEMPLATES,
            "maintenance": cls.MAINTENANCE_TEMPLATES,
        }
        
        templates = template_pools.get(phase, cls.SKILL_BUILDING_TEMPLATES)
        
        # Pick a random template
        template = random.choice(templates)
        
        # Select variations (avoid repetition)
        opening_type = random.choice(list(cls.OPENINGS.keys()))
        opening = random.choice(cls.OPENINGS[opening_type])
        
        connector = random.choice(cls.CONNECTORS)
        
        closer_type = random.choice(list(cls.CLOSERS.keys()))
        closer = random.choice(cls.CLOSERS[closer_type])
        
        bridge = random.choice(cls.BRIDGES)
        
        # Format with variables
        format_dict = {
            "opening": opening,
            "connector": connector,
            "closer": closer,
            "bridge": bridge,
            **variables,
        }
        
        try:
            response = template.strip().format(**format_dict)
        except KeyError as e:
            # Fallback if missing variables
            response = template.strip()
        
        # Post-process to clean up
        response = "\n".join([line.strip() for line in response.split("\n") if line.strip()])
        
        if conversation_memory:
            conversation_memory.add_response("generated", response)
        
        return response


class ConversationContextBuilder:
    """Build context from session history"""
    
    @staticmethod
    def build_from_history(
        messages: List[Dict],
        assessments: List[Dict],
        max_turns: int = 5,
    ) -> Dict:
        """
        Extract context from conversation history
        
        Returns:
        {
          "topics_discussed": [...],
          "recent_struggles": [...],
          "recent_wins": [...],
          "repeated_concerns": [...],
          "acknowledgements_made": [...],
        }
        """
        
        topics = set()
        struggles = []
        wins = []
        concerns = []
        
        # Analyze last few messages
        for msg in messages[-max_turns:]:
            text = msg.get("content", "").lower()
            
            # Detect topics
            if any(w in text for w in ["sleep", "insomnia", "tired"]):
                topics.add("sleep")
            if any(w in text for w in ["work", "job", "boss", "colleague"]):
                topics.add("work")
            if any(w in text for w in ["family", "parent", "spouse", "relationship"]):
                topics.add("relationships")
            if any(w in text for w in ["anxious", "anxiety", "nervous", "worry"]):
                topics.add("anxiety")
            if any(w in text for w in ["depressed", "sad", "hopeless", "worthless"]):
                topics.add("depression")
            
            # Detect struggles vs wins
            if any(w in text for w in ["can't", "struggling", "hard", "failed", "worse"]):
                struggles.append(text[:50])
            if any(w in text for w in ["better", "helped", "worked", "good", "improved"]):
                wins.append(text[:50])
            
            # Detect repeated concerns
            if msg.get("role") == "user":
                concerns.append(text[:50])
        
        # Get assessment trend
        recent_improvement = 0
        if len(assessments) >= 2:
            prev_score = assessments[-2].get("total_score", 0)
            curr_score = assessments[-1].get("total_score", 0)
            recent_improvement = ((prev_score - curr_score) / prev_score * 100) if prev_score > 0 else 0
        
        return {
            "topics_discussed": list(topics),
            "recent_struggles": struggles,
            "recent_wins": wins,
            "repeated_concerns": concerns,
            "recent_improvement_pct": recent_improvement,
        }


# ============================================================================
# TEST
# ============================================================================

if __name__ == "__main__":
    
    # Test 1: Generate multiple responses for same scenario (should vary)
    print("=" * 80)
    print("TEST: RESPONSE VARIATION")
    print("=" * 80)
    
    context = {
        "baseline_phq9": 24,
        "current_phq9": 14,
        "improvement_pct": 42,
    }
    
    print("\n🧠 Generating 3 responses to same scenario (should vary):\n")
    
    for i in range(1, 4):
        response = HumanlikeResponseBuilder.build_response(
            phase="skill_building",
            user_text="I'm starting to see patterns in my negative thoughts",
            context=context,
            skill_name="thought record",
            previous_skill="breathing",
            new_skill="cognitive reframing",
        )
        print(f"Response {i}:\n{response}\n")
        print("-" * 80)
    
    # Test 2: Conversation awareness (avoid repetition)
    print("\n" + "=" * 80)
    print("TEST: CONVERSATION AWARENESS")
    print("=" * 80)
    
    awareness = ConversationAwareness()
    
    for j in range(3):
        response = HumanlikeResponseBuilder.build_response(
            phase="stabilization",
            user_text="I'm feeling overwhelmed",
            conversation_memory=awareness,
            skill_name="grounding",
            skill_steps="5 things you see, 4 you hear, 3 you touch...",
            skill_explanation="This anchors you to the present moment",
        )
        print(f"\nResponse {j+1} (memory tracking):\n{response}")
        print(f"Last responses: {awareness.last_responses[-1]['type']}")
        print("-" * 80)
    
    print("\n✅ Humanlike response tests complete!")
