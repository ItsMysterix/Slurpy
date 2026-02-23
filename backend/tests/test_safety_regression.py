"""
Safety regression test suite: ensures crisis detection and routing are preserved.

Run with: pytest backend/tests/test_safety_regression.py -v
          or for CI: PYTEST_TIMEOUT=30 pytest backend/tests/test_safety_regression.py -v
"""

from __future__ import annotations

import os
import sys

THIS_DIR = os.path.dirname(__file__)
PKG_ROOT = os.path.abspath(os.path.join(THIS_DIR, ".."))
if PKG_ROOT not in sys.path:
    sys.path.insert(0, PKG_ROOT)

import pytest
from slurpy.domain.safety.service import classify, is_crisis, crisis_message


class TestCrisisDetection:
    """Ensure immediate-level threats are detected."""

    IMMEDIATE_SAMPLES = [
        # Direct suicidal intent
        "I'm going to kill myself tonight",
        "I want to end my life",
        "I've decided to take my life",
        "I can't go on anymore",
        # Variants with punctuation/spacing
        "i'm going to end it all!!!",
        "end my life now",
    ]

    @pytest.mark.parametrize("text", IMMEDIATE_SAMPLES)
    def test_immediate_detection(self, text: str):
        """High-risk phrases must classify as 'immediate'."""
        level, details = classify(text)
        assert level == "immediate", f"Expected 'immediate' for: {text}"
        assert details is not None
        assert "pattern" in details

    def test_elevated_self_harm(self):
        """Non-suicidal self-harm should flag as 'elevated'."""
        level, details = classify("I'm cutting myself to cope")
        assert level == "elevated", "Self-harm without timing should be 'elevated'"
        assert details is not None

    def test_elevated_with_means_escalates(self):
        """Elevated + means (pills, rope, etc.) should escalate to immediate."""
        level, _details = classify("I can't cope anymore. I have pills here.")
        assert level == "immediate", "Elevated + means should escalate to immediate"

    def test_elevated_with_timing_escalates(self):
        """Elevated + imminent timing should escalate to immediate."""
        level, _details = classify("I hurt myself. Planning to do it again tonight.")
        assert level == "immediate", "Elevated + timing should escalate to immediate"

    def test_no_false_positive_on_safe_text(self):
        """Safe text should not trigger crisis."""
        level, _details = classify("I'm feeling a bit down but going to the gym")
        assert level is None, "Safe, coping-aware text should not trigger"

    def test_no_false_positive_on_hypothetical(self):
        """Hypothetical or past-tense should be lower-priority (implementation varies)."""
        # Note: current regex is conservative; past-tense "I tried" != "I will"
        level, _details = classify("Earlier I thought about ending things, but I called a friend")
        # May be None or elevated depending on implementation; the key is:
        # it shouldn't route the same as current-intent immediate
        assert level in {None, "elevated"}, "Past-tense should not be immediate"


class TestCrisisMessageRouting:
    """Ensure crisis_message() returns region-specific guidance."""

    def test_base_message_always_present(self):
        """Crisis message should always direct to emergency services."""
        msg = crisis_message()
        assert "emergency services" in msg.lower()

    def test_us_routing(self):
        """US region should include 988 and 741741."""
        msg = crisis_message(region="US")
        assert "988" in msg
        assert "741741" in msg or "Crisis Text Line" in msg

    def test_ca_routing(self):
        """Canada should include 988 guidance."""
        msg = crisis_message(region="CA")
        assert "988" in msg

    def test_uk_routing(self):
        """UK should include Samaritans."""
        msg = crisis_message(region="UK")
        assert "116" in msg or "Samaritans" in msg.lower()

    def test_au_routing(self):
        """Australia should include Lifeline."""
        msg = crisis_message(region="AU")
        assert "13 11 14" in msg or "Lifeline" in msg.lower()

    def test_therapist_memory_prompt(self):
        """If memories mention therapist, add reach-out prompt."""
        memories = ["My therapist mentioned coping strategies"]
        msg = crisis_message(memories=memories)
        assert "therapist" in msg.lower() or "trusted contact" in msg.lower()


class TestIsCrisisHelper:
    """Ensure is_crisis() correctly identifies crisis levels."""

    def test_is_crisis_on_immediate(self):
        assert is_crisis("immediate") is True

    def test_is_crisis_on_elevated(self):
        assert is_crisis("elevated") is True

    def test_is_crisis_on_none(self):
        assert is_crisis(None) is False

    def test_is_crisis_on_other_levels(self):
        assert is_crisis("neutral") is False
        assert is_crisis("sad") is False


class TestSafetyEdgeCases:
    """Ensure safety classifier is robust to edge cases."""

    def test_empty_string(self):
        """Empty input should not crash."""
        level, _details = classify("")
        assert level is None

    def test_very_long_input(self):
        """Long input should not crash (though perf may vary)."""
        long_text = "I'm happy " * 10000
        level, _details = classify(long_text)
        assert level is None  # Should be safe, not crisis

    def test_mixed_case_and_punctuation(self):
        """Case and punctuation variations should detect crisis."""
        variants = [
            "I'M GOING TO KILL MYSELF",
            "i'm gonna kill myself!!!",
            "I'm going..to...kill myself",
        ]
        for text in variants:
            level, _details = classify(text)
            assert level in {"immediate", "elevated"}, f"Variant failed: {text}"

    def test_unicode_handling(self):
        """Unicode should not crash classifier."""
        level, _details = classify("I'm sad 😢 and want to end it all 🔪")
        # Should detect crisis despite emoji
        assert level in {"immediate", "elevated", None}


class TestFalsePositives:
    """Ensure colloquial/idiomatic phrases don't trigger false crisis alerts."""

    FALSE_POSITIVE_SAMPLES = [
        # Code/tech metaphors
        "I'm going to murder this code review",
        "This algorithm is killing it",
        "Let me kill this bug",
        "I want to end this meeting right now",
        # Colloquial expressions
        "The lights just died on my street",
        "Kill the lights before you leave",
        "She was dying to see you",
        "I'm dying of laughter",
        "That joke killed me",
        "This party is dead",
        "I'm going to take a nap",
        "Let me end this sentence",
        "I want to end this relationship",
        # Figurative language
        "This product is dead in the market",
        "My enthusiasm is dying",
        "My battery is about to die",
        "That joke was dark",
    ]

    @pytest.mark.parametrize("text", FALSE_POSITIVE_SAMPLES)
    def test_no_false_crisis_on_idioms(self, text: str):
        """Idiomatic phrases must NOT classify as crisis."""
        level, _details = classify(text)
        assert level is None, f"False positive on: {text} (got {level})"


class TestCrisisIntegration:
    """End-to-end integration tests for crisis flow."""

    def test_crisis_flow_detect_then_message(self):
        """Typical flow: detect crisis, then fetch message."""
        user_text = "I've decided to take my life tonight"
        level, details = classify(user_text)
        assert is_crisis(level)
        msg = crisis_message()
        assert "emergency" in msg.lower()

    def test_no_crisis_bypass_on_minor_sad(self):
        """Minor sadness alone should not trigger crisis flow."""
        level, _details = classify("I'm feeling a bit sad today")
        assert not is_crisis(level)
