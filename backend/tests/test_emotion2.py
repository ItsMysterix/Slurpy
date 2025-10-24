import os
import sys

# Ensure backend package root is importable
THIS_DIR = os.path.dirname(__file__)
PKG_ROOT = os.path.abspath(os.path.join(THIS_DIR, ".."))
if PKG_ROOT not in sys.path:
    sys.path.insert(0, PKG_ROOT)

from slurpy.domain.nlp.emotion2 import EmotionBrain


def test_emotion_brain_predict_smoke():
    eb = EmotionBrain()
    out = eb.predict("I'm so stressed but hopeful about the future.")
    assert isinstance(out, dict)
    assert "labels" in out and isinstance(out["labels"], list)
    assert "probs" in out and isinstance(out["probs"], dict)
    assert "valence" in out and isinstance(out["valence"], float)
    assert "arousal" in out and isinstance(out["arousal"], float)
    # labels should be non-empty top-k list
    assert len(out["labels"]) >= 1
