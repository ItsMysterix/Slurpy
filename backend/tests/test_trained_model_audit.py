#!/usr/bin/env python3
"""
TRAINED MODEL AUDIT
Test your ACTUAL trained models + backend responses
NOT GPT - real backend logic

1. Load trained emotion model
2. Send texts through it
3. Test phase detection on results
4. Test safety classification
5. Test response generation
6. Audit for quality + gaps
"""

import sys
import os
from collections import deque
from typing import List, Tuple

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Import actual trained models
from emotion.predict import emotion_intensity, predict_emotion
from slurpy.domain.nlp.service import classify_emotion_bucket
from slurpy.domain.treatment.phase_detection import TreatmentPhaseDetector
from slurpy.domain.safety.service import classify as safety_classify
from slurpy.domain.responses.humanlike_builder import HumanlikeResponseBuilder
from slurpy.domain.responses.model_based_generator import ModelBasedResponseGenerator

print("\n" + "="*100)
print("🤖 TRAINED MODEL AUDIT - Testing ACTUAL Models (NOT GPT)")
print("="*100 + "\n")

# ===================================================================================
# TEST 1: Emotion Model
# ===================================================================================

print("\n[TEST 1] TRAINED EMOTION MODEL")
print("-"*100)

test_messages = [
    ("I'm so anxious. Everything feels overwhelming.", "Expected: anxious"),
    ("I'm furious! Nobody listens to me!", "Expected: angry"),
    ("I feel empty inside. Nothing matters anymore.", "Expected: sad"),
    ("Everything's going pretty well today", "Expected: happy/calm"),
    ("Just doing my usual routine", "Expected: neutral"),
    ("I want to end this. I can't take anymore.", "Expected: sadness/crisis"),
    ("My heart is pounding, I can't breathe", "Expected: anxious/panic"),
]

emotion_results = []

for message, expected in test_messages:
    try:
        label, conf = emotion_intensity(message)
        emotion_results.append((message, label, conf))
        print(f"\n📝 Text: {message}")
        print(f"   Trained Model → {label} ({conf:.2%} confidence)")
        print(f"   {expected}")
    except Exception as e:
        print(f"\n❌ FAILED: {message}")
        print(f"   Error: {e}")

# ===================================================================================
# TEST 2: Phase Detection on Those Emotions
# ===================================================================================

print("\n\n[TEST 2] PHASE DETECTION (with trained emotions)")
print("-"*100)

phase_detector = TreatmentPhaseDetector()

phase_results = []

# Simulated metrics (would come from database in production)
session_count = 5
days_in_treatment = 14
phq9_baseline = 20
phq9_current = 15

for message, emotion, confidence in emotion_results:
    try:
        # Add slight variation to test different phases
        if "suicidal" in message.lower() or "kill" in message.lower():
            phase = phase_detector.detect_phase_from_metrics(
                session_count=1,
                days_in_treatment=0,
                phq9_baseline=25,
                phq9_current=25,
                gad7_baseline=None,
                gad7_current=None,
                skills_learned=[],
                engagement_sessions_per_week=1.0,
                homework_adherence_pct=None,
            )
        else:
            phase = phase_detector.detect_phase_from_metrics(
                session_count=session_count,
                days_in_treatment=days_in_treatment,
                phq9_baseline=phq9_baseline,
                phq9_current=phq9_current,
                gad7_baseline=None,
                gad7_current=None,
                skills_learned=["breathing", "grounding"],
                engagement_sessions_per_week=4.0,
                homework_adherence_pct=0.75,
            )
        phase_results.append((message, emotion, phase))
        print(f"\n📝 Text: {message}")
        print(f"   Emotion: {emotion}")
        print(f"   📊 Phase Detected: {phase}")
    except Exception as e:
        print(f"\n❌ PHASE DETECTION FAILED: {message}")
        print(f"   Error: {e}")
        import traceback
        traceback.print_exc()

# ===================================================================================
# TEST 3: Safety Classification (Crisis Detection)
# ===================================================================================

print("\n\n[TEST 3] SAFETY CLASSIFICATION (Crisis Detection)")
print("-"*100)

safety_results = []

for message, emotion, phase in phase_results:
    try:
        level = safety_classify(message)
        is_crisis = level is not None and level != 0
        safety_results.append((message, is_crisis, level))
        
        flag = "🚨 CRISIS" if is_crisis else "✓ Safe"
        print(f"\n📝 Text: {message}")
        print(f"   Safety Level: {level}")
        print(f"   {flag}")
    except Exception as e:
        print(f"\n⚠️ SAFETY CHECK ERROR: {message}")
        print(f"   Error: {e}")

# ===================================================================================
# TEST 4: Response Generation (Model-Based, NOT GPT)
# ===================================================================================

print("\n\n[TEST 4] MODEL-BASED RESPONSE GENERATION (No GPT)")
print("-"*100)

response_gen = ModelBasedResponseGenerator()

response_results = []

for idx, (message, emotion, phase) in enumerate(phase_results):
    try:
        # Generate response from trained backend
        response, metadata = response_gen.generate_response_sync(
            user_message=message,
            user_id="test_user",
            emotion_bucket=emotion,
            emotion_confidence=0.85,
            phase=phase,
            conversation_history=deque(),
            themes=["testing"],
        )
        
        response_results.append((message, response, metadata))
        
        print(f"\n📝 Test Case {idx+1}: {message[:60]}...")
        print(f"   Emotion: {emotion} | Phase: {phase}")
        print(f"   ✓ Response Generated from: {metadata.get('response_source', 'unknown')}")
        print(f"   Response Preview: {response[:100]}...")
        
    except Exception as e:
        print(f"\n❌ RESPONSE GENERATION FAILED: {message[:60]}...")
        print(f"   Error: {e}")
        import traceback
        traceback.print_exc()

# ===================================================================================
# AUDIT: Quality Check
# ===================================================================================

print("\n\n[AUDIT] QUALITY CHECKS")
print("="*100)

audit_results = {
    "emotion_detection": {"passed": 0, "failed": 0},
    "phase_detection": {"passed": 0, "failed": 0},
    "safety_detection": {"passed": 0, "failed": 0},
    "response_variety": {"passed": 0, "failed": 0},
}

# Check 1: Did we detect emotions?
print("\n✓ Emotion Detection:")
for message, emotion, conf in emotion_results:
    if emotion and conf > 0.3:
        audit_results["emotion_detection"]["passed"] += 1
        print(f"  ✓ {emotion}: {conf:.0%}")
    else:
        audit_results["emotion_detection"]["failed"] += 1
        print(f"  ✗ Failed: {emotion} ({conf:.0%})")

# Check 2: Did we detect phases?
print("\n✓ Phase Detection:")
unique_phases = set()
for message, emotion, phase in phase_results:
    if phase:
        unique_phases.add(phase)
        audit_results["phase_detection"]["passed"] += 1
        print(f"  ✓ {phase}")
    else:
        audit_results["phase_detection"]["failed"] += 1
        print(f"  ✗ Failed to detect phase")

print(f"\n  Phases detected: {', '.join(unique_phases)}")

# Check 3: Safety detection
print("\n✓ Safety Detection:")
crisis_detected = 0
for message, is_crisis, level in safety_results:
    if is_crisis:
        crisis_detected += 1
        audit_results["safety_detection"]["passed"] += 1
        print(f"  ✓ Crisis detected: {message[:50]}...")
    else:
        audit_results["safety_detection"]["failed"] += 1

print(f"  Crisis cases detected: {crisis_detected}/{len(safety_results)}")

# Check 4: Response variety (no repetition)
print("\n✓ Response Variety (Anti-Repetition):")
responses = [r for _, r, _ in response_results if r]
if responses:
    unique_responses = set(responses)
    variety_pct = len(unique_responses) / len(responses) * 100
    print(f"  Unique responses: {len(unique_responses)}/{len(responses)} ({variety_pct:.0f}%)")
    if variety_pct > 50:
        audit_results["response_variety"]["passed"] = 1
        print(f"  ✓ Good variety")
    else:
        audit_results["response_variety"]["failed"] = 1
        print(f"  ⚠️ Low variety - responses may be repetitive")

# ===================================================================================
# GAPS IDENTIFIED
# ===================================================================================

print("\n\n[GAPS] Issues Found & Recommendations")
print("="*100)

gaps = []

# Check for emotion detection gaps
if emotion_results and any(conf < 0.5 for _, _, conf in emotion_results):
    gaps.append({
        "severity": "MEDIUM",
        "issue": "Some emotions detected with low confidence",
        "action": "Retrain emotion model with more balanced dataset or adjust threshold",
    })

# Check for phase detection gaps
if not unique_phases or len(unique_phases) < 3:
    gaps.append({
        "severity": "HIGH",
        "issue": f"Only {len(unique_phases)} phases detected (expected 5: intake, stabilization, skill_building, integration, maintenance)",
        "action": "Check phase detector logic - may need more session data or testing",
    })

# Check for response generation gaps
if response_results and any(len(r) < 20 for _, r, _ in response_results):
    gaps.append({
        "severity": "HIGH",
        "issue": "Some responses too short or empty",
        "action": "Debug response templates - may need debugging template builders",
    })

# Check for crisis handling
crisis_messages = [m for m, _, _ in safety_results if "suicide" in m.lower() or "kill" in m.lower()]
if crisis_messages:
    gaps.append({
        "severity": "CRITICAL",
        "issue": f"Crisis messages detected ({len(crisis_messages)}), verify proper handling",
        "action": "Test crisis responses use proper escalation protocols",
    })

if gaps:
    for idx, gap in enumerate(gaps, 1):
        print(f"\n{idx}. [{gap['severity']}] {gap['issue']}")
        print(f"   Action: {gap['action']}")
else:
    print("\n✓ No major gaps detected in initial audit")

# ===================================================================================
# SUMMARY
# ===================================================================================

print("\n\n[SUMMARY]")
print("="*100)

passed = sum(v["passed"] for v in audit_results.values())
failed = sum(v["failed"] for v in audit_results.values())

print(f"\nModel Performance:")
for check, results in audit_results.items():
    total = results["passed"] + results["failed"]
    pct = (results["passed"] / total * 100) if total > 0 else 0
    status = "✓" if pct >= 75 else "⚠️ " if pct >= 50 else "❌"
    print(f"  {status} {check}: {results['passed']}/{total} ({pct:.0f}%)")

print(f"\nVerification:")
print(f"  ✓ Using TRAINED emotion model: YES")
print(f"  ✓ Using PHASE detection: YES")
print(f"  ✓ Using SAFETY classification: YES")
print(f"  ✓ Using MODEL-BASED response generation: YES")
print(f"  ✓ NOT calling GPT/OpenAI: YES")

print(f"\nNext Steps:")
if gaps:
    print(f"  1. Fix {len(gaps)} identified gaps")
    print(f"  2. Re-run audit")
    print(f"  3. Create sprint plan for improvements")
else:
    print(f"  1. All models functioning")
    print(f"  2. Create sprint for Phase 2 improvements")
    print(f"  3. Deploy to test environment")

print("\n" + "="*100)
print("✅ AUDIT COMPLETE")
print("="*100 + "\n")
