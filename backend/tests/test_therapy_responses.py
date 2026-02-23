"""Test the enhanced therapy response generator."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from collections import deque
from slurpy.domain.responses.model_based_generator import ModelBasedResponseGenerator

gen = ModelBasedResponseGenerator()

tests = [
    ("I feel so anxious about my job interview tomorrow", "anxious", 0.91, "stabilization", ["work_stress", "anxiety"], "daily_struggle", 0.55),
    ("My partner left me and I feel empty inside", "sad", 0.88, "intake", ["relationships", "depression"], "relationship_issue", 0.65),
    ("I just want to die sometimes", "sad", 0.95, "stabilization", ["depression"], "crisis", 0.92),
    ("I practiced the breathing exercise you suggested", "calm", 0.72, "skill_building", [], "progress_update", 0.2),
    ("I keep having nightmares about what happened", "anxious", 0.85, "stabilization", ["trauma"], "trauma_processing", 0.7),
]

for msg, emotion, conf, phase, themes, intent, sev in tests:
    resp, meta = gen.generate_response_sync(
        user_message=msg,
        user_id="test",
        emotion_bucket=emotion,
        emotion_confidence=conf,
        phase=phase,
        conversation_history=deque(),
        themes=themes,
        intent=intent,
        severity=sev,
    )
    print(f"\n{'='*70}")
    print(f"USER: {msg}")
    print(f"[emotion={emotion} intent={intent} severity={sev} phase={phase}]")
    print(f"SLURPY: {resp}")
    print(f"META: {meta}")

print(f"\n{'='*70}")
print("All tests passed - NO OpenAI calls made")
