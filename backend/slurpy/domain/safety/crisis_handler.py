"""
Crisis Response Handler
Specialized module for suicide risk, self-harm, and acute distress
NO generic templates - specific DBT/safety protocols

Routes crisis cases to proper escalation + immediate resources
Does NOT treat crisis like normal conversation = CRITICAL SAFETY FIX
"""

from typing import Optional, Dict, Literal
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)

CrisisSeverity = Literal["low", "moderate", "elevated", "immediate"]


class CrisisIndicators:
    """Detect suicide/self-harm risk from user text"""
    
    # Explicit suicide indicators
    SUICIDE_KEYWORDS = [
        "kill myself",
        "want to die",
        "how to end it",
        "no point living",
        "suicide",
        "shouldn't be alive",
        "better off dead",
        "can't take this anymore",
        "give up",
        "no reason to live",
        "overdose",
        "jump",
        "hang",
        "carbon monoxide",
        "put a gun",
        "slit my wrists",
    ]
    
    # Self-harm keywords
    SELF_HARM_KEYWORDS = [
        "cut myself",
        "hurt myself",
        "burn myself",
        "punch",
        "bang my head",
        "self-harm",
        "self-injure",
    ]
    
    # Hopelessness indicators
    HOPELESSNESS_KEYWORDS = [
        "hopeless",
        "nothing matters",
        "pointless",
        "worthless",
        "burden",
        "better off without me",
        "everyone would be better",
        "give up",
        "too much",
        "can't handle this",
        "trapped",
    ]
    
    # Isolation indicators
    ISOLATION_KEYWORDS = [
        "alone",
        "no one cares",
        "no one understands",
        "isolation",
        "cut off from everyone",
        "lost everyone",
        "pushing people away",
    ]
    
    # Recent loss/trauma
    RECENT_TRAUMA_KEYWORDS = [
        "just found out",
        "just happened",
        "lost someone",
        "died",
        "breakup",
        "fired",
        "evicted",
        "yesterday",
        "today",
        "this morning",
    ]
    
    @classmethod
    def assess_severity(cls, user_text: str) -> CrisisSeverity:
        """
        Assess crisis severity from indicators
        
        Returns:
        - low: No indicators
        - moderate: Hopelessness/isolation but no plan
        - elevated: Some ideation or recent trauma
        - immediate: Active suicide/self-harm plan or attempt
        """
        
        text_lower = user_text.lower()
        
        # Check for immediate danger indicators
        explicit_suicide = any(kw in text_lower for kw in cls.SUICIDE_KEYWORDS)
        explicit_harm = any(kw in text_lower for kw in cls.SELF_HARM_KEYWORDS)
        
        if explicit_suicide or explicit_harm:
            # Check for intent/plan/attempt
            if any(phrase in text_lower for phrase in ["want to", "trying to", "about to", "going to", "will"]):
                return "immediate"
            else:
                return "elevated"
        
        # Check for hopelessness
        hopeless = any(kw in text_lower for kw in cls.HOPELESSNESS_KEYWORDS)
        isolated = any(kw in text_lower for kw in cls.ISOLATION_KEYWORDS)
        recent_trauma = any(kw in text_lower for kw in cls.RECENT_TRAUMA_KEYWORDS)
        
        if hopeless and isolated and recent_trauma:
            return "elevated"
        elif hopeless and isolated:
            return "moderate"
        elif hopeless or (isolated and recent_trauma):
            return "moderate"
        
        return "low"


class CrisisResponseProtocol:
    """
    DBT/Clinical crisis protocols
    NOT templates - these are safety procedures
    """
    
    @staticmethod
    def immediate_crisis_response(user_text: str) -> Dict:
        """
        Response to active suicide/self-harm attempt or imminent danger
        
        Returns:
        {
          "response": str (to show user),
          "escalate": bool,
          "resources": Dict,
          "action": str (what system should do),
        }
        """
        
        logger.warning(f"IMMEDIATE CRISIS DETECTED: {user_text[:100]}")
        
        response_text = """I'm very concerned about what you just shared with me.
        
I take this seriously. You matter, and this moment matters.

RIGHT NOW, I need you to reach out to someone immediately:

🚨 **NATIONAL SUICIDE PREVENTION LIFELINE: 988**
   - Call or text 988 (24/7, free, confidential)
   - They're trained for exactly this

🚨 **CRISIS TEXT LINE: Text "HELLO" to 741741**
   - If you can't talk, texting is an option

🚨 **EMERGENCY SERVICES: 911**
   - If you're in immediate danger or have a plan
   - Or go to your nearest emergency room

If you're outside the US:
   - International Association for Suicide Prevention: https://www.iasp.info/resources/Crisis_Centres/

---

While you're reaching out to them, I want to ask: **Do you have a safe place right now? 
Someone you trust nearby?**

I'm not going anywhere. But right now, talking to someone trained specifically for crisis 
is what you need. Please reach out within the next 5 minutes.

**Type your response when you're ready.**
        """
        
        return {
            "response": response_text,
            "escalate": True,
            "severity": "immediate",
            "action": "NOTIFY_SAFETY_TEAM",
            "resources": {
                "suicide_lifeline": "988",
                "crisis_text_line": "741741",
                "emergency": "911",
            },
            "timestamp": datetime.utcnow().isoformat(),
            "requires_human_review": True,
            "suggested_followup": "Verify user reached out to crisis service",
        }
    
    @staticmethod
    def elevated_crisis_response(user_text: str) -> Dict:
        """
        Response to moderate-to-high suicide ideation (no immediate plan)
        
        DBT protocol: Safety planning + resource mobilization
        """
        
        logger.warning(f"ELEVATED CRISIS: {user_text[:100]}")
        
        response_text = """I hear the pain you're describing, and I want you to know that 
I'm taking this very seriously.

What you're feeling right now—this intensity, this darkness—is real. And it's also temporary.
Feelings change, even when it doesn't feel that way.

**Let's do something together right now called a Safety Plan.**

This isn't about judgment. It's about protecting you.

**I need you to answer a few things:**

1. **Right now, are you safe?** (Yes/No) 
   - Meaning: You're not in immediate danger, you're not about to hurt yourself

2. **Do you have access to methods?** (Like medications, weapons, etc.)
   - We may need to talk about securing those

3. **Who can you call right now if things get worse?**
   - Friend, family member, emergency line?

4. **What usually helps when you feel this way?** (Even a little bit)
   - Music, walk, shower, person to talk to?

**And I want to give you this number to have:**

📞 National Suicide Prevention Lifeline: **988** (call or text)

If things get worse, you can call 988 or text them. They're trained for this.

Please answer those questions so we can build your safety plan.
        """
        
        return {
            "response": response_text,
            "escalate": True,
            "severity": "elevated",
            "action": "SAFETY_PLANNING_PROTOCOL",
            "resources": {
                "suicide_lifeline": "988",
                "crisis_text_line": "741741",
            },
            "requires_followup": True,
            "followup_type": "safety_assessment",
            "timestamp": datetime.utcnow().isoformat(),
        }
    
    @staticmethod
    def moderate_crisis_response(user_text: str) -> Dict:
        """
        Response to hopelessness + isolation (risk present but lower acuity)
        
        Protocol: Validate, assess support, teach coping skill
        """
        
        logger.info(f"MODERATE CRISIS: {user_text[:100]}")
        
        response_text = """I hear you. Feeling this kind of hopelessness, trapped, and alone—
that's one of the most painful places to be.

And I want you to know: **You've already done the hardest part by telling me.**

Here's what I know:
- Hopelessness is a symptom, not reality
- Isolation makes it so much worse
- This feeling won't last forever, even though it feels like it will

**Let's do two things:**

**First, let's connect you:**
Who's someone you trust—friend, family, therapist, counselor? 
If you don't have anyone, organizations like 988 (Suicide Prevention Lifeline) are there.

**Second, let's get you grounded in this moment:**
Right now, what's one small thing you can do?
- Text a friend
- Step outside
- Drink water
- Listen to a song you like
- Take a shower

Not to "fix it." Just to get through the next hour.

If you're thinking about hurting yourself, please call 988.
You deserve support through this.

**What's happening in your life that led to feeling this way?**
        """
        
        return {
            "response": response_text,
            "escalate": False,
            "severity": "moderate",
            "action": "SUPPORT_CONNECTION",
            "resources": {
                "suicide_lifeline": "988",
            },
            "requires_followup": True,
            "followup_days": 1,
            "timestamp": datetime.utcnow().isoformat(),
        }


class CrisisHandler:
    """Main crisis dispatch logic"""
    
    def __init__(self, db_client=None, notify_callback=None):
        self.db = db_client
        self.notify_callback = notify_callback  # For notifying safety team
    
    async def handle_crisis(self, user_text: str, user_id: str) -> Dict:
        """
        Route crisis based on severity
        
        Returns response + actions
        """
        
        # Assess severity
        severity = CrisisIndicators.assess_severity(user_text)
        
        logger.warning(f"Crisis severity: {severity} | User: {user_id}")
        
        # Route to appropriate protocol
        if severity == "immediate":
            result = CrisisResponseProtocol.immediate_crisis_response(user_text)
        elif severity == "elevated":
            result = CrisisResponseProtocol.elevated_crisis_response(user_text)
        elif severity == "moderate":
            result = CrisisResponseProtocol.moderate_crisis_response(user_text)
        else:
            return {"response": None, "requires_crisis_handling": False}
        
        # Log crisis event
        if self.db:
            try:
                await self.db.table("crisis_events").insert({
                    "user_id": user_id,
                    "severity": severity,
                    "text_snippet": user_text[:200],
                    "protocol": result.get("action"),
                    "detected_at": datetime.utcnow().isoformat(),
                }).execute()
            except Exception as e:
                logger.error(f"Failed to log crisis event: {e}")
        
        # Notify safety team if escalation needed
        if result.get("requires_human_review") and self.notify_callback:
            await self.notify_callback(
                user_id=user_id,
                severity=severity,
                message=user_text,
            )
        
        result["requires_crisis_handling"] = True
        result["severity"] = severity
        
        return result
    
    def is_crisis(self, user_text: str) -> bool:
        """Quick check: is this a crisis?"""
        severity = CrisisIndicators.assess_severity(user_text)
        return severity in ["moderate", "elevated", "immediate"]


# ============================================================================
# TEST
# ============================================================================

if __name__ == "__main__":
    
    test_cases = [
        ("Low", "I've been feeling a bit down lately."),
        ("Moderate", "I feel hopeless. Nobody cares about me. I'm alone."),
        ("Elevated", "I've been thinking about suicide but I don't have a plan yet."),
        ("Immediate", "I'm going to kill myself tonight. I have the pills right here."),
    ]
    
    print("=" * 80)
    print("🚨 CRISIS DETECTION & PROTOCOL TEST")
    print("=" * 80)
    
    for severity_label, text in test_cases:
        print(f"\n{'='*80}")
        print(f"Severity Expected: {severity_label}")
        print(f"Text: {text}")
        print("-" * 80)
        
        detected = CrisisIndicators.assess_severity(text)
        print(f"✓ Severity Detected: {detected}")
        
        handler = CrisisHandler()
        if handler.is_crisis(text):
            print(f"✓ Flagged as CRISIS")
            
            # Get protocol response
            if detected == "immediate":
                result = CrisisResponseProtocol.immediate_crisis_response(text)
            elif detected == "elevated":
                result = CrisisResponseProtocol.elevated_crisis_response(text)
            else:
                result = CrisisResponseProtocol.moderate_crisis_response(text)
            
            print(f"\nProtocol: {result['action']}")
            print(f"Escalate: {result.get('escalate', False)}")
            print(f"\nResponse (first 200 chars):\n{result['response'][:200]}...")
        else:
            print(f"✓ NOT a crisis")
    
    print("\n" + "=" * 80)
    print("✅ Crisis protocol test complete")
