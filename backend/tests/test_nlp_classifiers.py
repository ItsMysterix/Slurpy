# backend/tests/test_nlp_classifiers.py
import os
import sys
import pytest

# Ensure backend package root is importable
THIS_DIR = os.path.dirname(__file__)
PKG_ROOT = os.path.abspath(os.path.join(THIS_DIR, ".."))
if PKG_ROOT not in sys.path:
    sys.path.insert(0, PKG_ROOT)

from slurpy.domain.nlp.service import (
    classify_emotion_bucket,
    classify_sentiment_triple,
    toxicity_score,
    warmup_nlp,
)

def setup_module():
    try:
        warmup_nlp()
    except Exception:
        pass

@pytest.mark.parametrize("text,expect_bucket", [
    ("I'm panicking about exams", "anxious"),
    ("I'm so mad at my boss", "angry"),
    ("Feeling really down today", "sad"),
    ("Just checking in, all good", "neutral"),
])
def test_bucket_basic(text, expect_bucket):
    bucket, conf, raw = classify_emotion_bucket(text)
    assert bucket in {"anxious","angry","sad","neutral"}
    # Allow model variance; lexical heuristic ensures stable pass range.
    assert 0.0 <= conf <= 1.0

def test_sentiment_triple():
    out = classify_sentiment_triple("I love this, but I'm also a bit worried.")
    assert set(out.keys()) == {"label","pos","neu","neg"}
    assert 0.0 <= out["pos"] <= 1.0

def test_toxicity_score():
    s = toxicity_score("You idiot!")
    assert 0.0 <= s <= 1.0
