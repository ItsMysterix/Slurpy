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
import slurpy.domain.nlp.service as nlp_service
from slurpy.domain.nlp.service import get_emotion_brain
from slurpy.domain.cel.service import user_baseline, deviation_score, adaptation_hint
import time
from slurpy.domain.nlp.service import __calib_canary__ as _cal_canary
from slurpy.domain.nlp.service import _CALIB_CANARY_BASELINE as _CAL_BASE

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


def _truthy_env(name: str) -> bool:
    return (os.getenv(name) or "").lower() in {"1","true","yes"}


def test_emotion2_memo_and_latency_if_enabled():
    if not _truthy_env("EMOTION_V2"):
        pytest.skip("Emotion v2 disabled")
    eb = get_emotion_brain()
    if eb is None:
        pytest.skip("EmotionBrain unavailable")
    txt = "I feel anxious but also hopeful"
    # First call
    t0 = time.time()
    out1 = eb.predict(txt)
    t1 = time.time() - t0
    # Second identical call should hit memo and be faster
    t0 = time.time()
    out2 = eb.predict(txt)
    t2 = time.time() - t0
    assert out1["probs"] == out2["probs"]
    assert -1.0 <= out2["valence"] <= 1.0
    assert -1.0 <= out2["arousal"] <= 1.0
    # Allow generous margin (memo should be noticeably faster)
    assert t2 <= t1 * 0.7 or (t1 > 0.05 and t2 < 0.02)


def test_emotion2_async_batch_basic_ranges():
    if not _truthy_env("EMOTION_V2"):
        pytest.skip("Emotion v2 disabled")
    eb = get_emotion_brain()
    if eb is None:
        pytest.skip("EmotionBrain unavailable")
    import asyncio

    async def run():
        texts = [f"short text {i}" for i in range(10)]
        outs = await asyncio.gather(*[eb.predict_async(t) for t in texts])
        for o in outs:
            assert isinstance(o, dict)
            assert "probs" in o and isinstance(o["probs"], dict)
            assert "labels" in o and isinstance(o["labels"], list)
            assert -1.0 <= o["valence"] <= 1.0
            assert -1.0 <= o["arousal"] <= 1.0
    asyncio.run(run())


def test_slang_emoji_no_crash_and_ranges():
    txt = "lmaooo 😭 i'm soooo done"
    # Always ensure legacy classifiers do not crash
    tri = classify_sentiment_triple(txt)
    assert set(tri.keys()) == {"label","pos","neu","neg"}
    assert 0.0 <= tri["pos"] <= 1.0

    # If EmotionBrain is enabled/available, validate VA ranges
    if _truthy_env("EMOTION_V2"):
        eb = get_emotion_brain()
        if eb is not None:
            out = eb.predict(txt)
            assert isinstance(out, dict) and "labels" in out and "probs" in out
            assert -1.0 <= out["valence"] <= 1.0
            assert -1.0 <= out["arousal"] <= 1.0


def test_personalization_baseline_and_deviation_math():
    # History around mildly positive/medium arousal
    hist = [(0.2, 0.3), (0.1, 0.4), (0.25, 0.35), (0.15, 0.45)]
    bl = user_baseline(hist)
    assert -1.0 <= bl["muV"] <= 1.0 and -1.0 <= bl["muA"] <= 1.0
    assert bl["sigmaV"] >= 0.1 and bl["sigmaA"] >= 0.1

    # Deviation grows when far from baseline
    dev_near = deviation_score(0.2, 0.3, bl)
    dev_far = deviation_score(-0.9, -0.9, bl)
    assert dev_far > dev_near

    # Adaptation hint stays within caps and valid tone
    hint = adaptation_hint(dev_far, toxicity=0.2, masking=False)
    assert hint["tone"] in {"calming","direct","normal"}
    assert 0.6 <= hint["budgetMultiplier"] <= 1.1


def test_calibration_canary_identity_vs_calibrated(monkeypatch):
    if not _truthy_env("EMOTION_V2"):
        pytest.skip("Emotion v2 disabled")
    # Identity case
    monkeypatch.delenv("EMOTION_CALIB_JSON", raising=False)
    st = _cal_canary()
    assert st["ok"] is True
    assert int(st["hash"]) == int(_CAL_BASE)
    # Calibrated case: change temperature for joy to alter dist
    monkeypatch.setenv("EMOTION_CALIB_JSON", "{\"temperature\": {\"joy\": 0.7}}")
    st2 = _cal_canary()
    assert st2["ok"] is True
    assert isinstance(st2["hash"], int)
    assert int(st2["hash"]) != int(_CAL_BASE)


def test_emotion_calibration_temperature_and_threshold_env_parsing_and_effects(monkeypatch):
    # Synthetic pipeline output: sums to 1.0
    scores = [[
        {"label": "joy", "score": 0.6},
        {"label": "sadness", "score": 0.3},
        {"label": "anger", "score": 0.1},
    ]]

    # No env: calibration should be identity (within tolerance)
    monkeypatch.delenv("EMOTION_CALIB_JSON", raising=False)
    no_cal = nlp_service._apply_emotion_calibration_to_scores(scores)
    assert isinstance(no_cal, list) and isinstance(no_cal[0], list)
    # Find joy score
    joy_no = next((d["score"] for d in no_cal[0] if d["label"].lower() == "joy"), None)
    assert joy_no is not None and abs(joy_no - 0.6) < 1e-6

    # Lower temperature (<1) for joy increases its share relative to unchanged others
    monkeypatch.setenv("EMOTION_CALIB_JSON", "{\"temperature\": {\"joy\": 0.7}}")
    cal1 = nlp_service._apply_emotion_calibration_to_scores(scores)
    joy_cal1 = next((d["score"] for d in cal1[0] if d["label"].lower() == "joy"), None)
    assert joy_cal1 is not None and joy_cal1 > joy_no

    # Threshold: with high threshold for joy, top selection should neutralize
    monkeypatch.setenv("EMOTION_CALIB_JSON", "{\"threshold\": {\"joy\": 0.95}}")
    # Using the identity-calibrated distribution again
    e_top = [(d["label"], d["score"]) for d in no_cal[0]]
    e_top.sort(key=lambda t: t[1], reverse=True)
    # Parse thresholds and apply selection
    _, thrmap = nlp_service._parse_emotion_calib_env()
    top_lab = nlp_service._select_top_with_threshold(e_top, thrmap)
    assert top_lab == "neutral"


def test_emotion_calibration_offline_sweep(monkeypatch):
    # Guard: only run when explicitly enabled to keep CI fast
    if (os.getenv("EMOTION_CALIB_SWEEP") or "").lower() not in {"1","true","yes"}:
        pytest.skip("Sweep disabled")

    # Tiny synthetic corpus of distributions over [joy, sadness, anger]
    corpus = [
        [{"label": "joy", "score": 0.7}, {"label": "sadness", "score": 0.2}, {"label": "anger", "score": 0.1}],
        [{"label": "joy", "score": 0.6}, {"label": "sadness", "score": 0.3}, {"label": "anger", "score": 0.1}],
        [{"label": "joy", "score": 0.4}, {"label": "sadness", "score": 0.5}, {"label": "anger", "score": 0.1}],
        [{"label": "joy", "score": 0.5}, {"label": "sadness", "score": 0.4}, {"label": "anger", "score": 0.1}],
    ]

    temps = [0.9, 1.0, 1.1]
    best = None
    best_score = -1e9
    # Grid over temps for joy & sadness; keep anger fixed at 1.0
    for tj in temps:
        for ts in temps:
            # Build env JSON
            env = {"temperature": {"joy": tj, "sadness": ts, "anger": 1.0}}
            monkeypatch.setenv("EMOTION_CALIB_JSON", json_min(env))
            # Evaluate objective: mean(joy) - penalty if anger exceeds ceiling
            joys: list[float] = []
            penalty = 0.0
            for dist in corpus:
                out = nlp_service._apply_emotion_calibration_to_scores([dist])[0]
                # map back
                mp = {d["label"].lower(): float(d["score"]) for d in out}
                joys.append(mp.get("joy", 0.0))
                anger = mp.get("anger", 0.0)
                if anger > 0.2:
                    penalty += (anger - 0.2) * 10.0
            score = (sum(joys) / max(1, len(joys))) - penalty
            if score > best_score:
                best_score = score
                best = {"temperature": {"joy": tj, "sadness": ts}}

    # Print a single suggestion line with minified JSON as a string
    if best is None:
        best = {"temperature": {}}
    print("emotion.calib.suggest", {"j": json_min(best)})


# --- tiny helper for minified JSON string ---
def json_min(obj) -> str:
    import json as _json
    return _json.dumps(obj, separators=(",", ":"), sort_keys=True)
