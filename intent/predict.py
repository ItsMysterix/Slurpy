"""
Intent prediction for therapy conversations.
Mirrors emotion/predict.py architecture.

Usage:
    from intent.predict import predict_intent, intent_with_confidence
    
    intent = predict_intent("I can't sleep at night")
    # → "sleep_issue"
    
    intent, confidence = intent_with_confidence("I want to die")
    # → ("crisis", 0.97)
"""

import json
import threading
from typing import Tuple, List, Dict

import torch
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

_MODEL = "intent/model"

_tok = None
_model = None
ID2LABEL = None
_load_lock = threading.Lock()
_load_failed = False


class IntentModelNotAvailableError(RuntimeError):
    """Raised when intent model files are missing."""


def _ensure_model_loaded() -> None:
    """Lazy-load tokenizer, model, labels. Thread-safe."""
    global _tok, _model, ID2LABEL, _load_failed

    if _model is not None or _load_failed:
        return

    with _load_lock:
        if _model is not None or _load_failed:
            return
        try:
            _tok = DistilBertTokenizerFast.from_pretrained(_MODEL)
            _model = DistilBertForSequenceClassification.from_pretrained(_MODEL)
            _model.eval()
            with open(f"{_MODEL}/labels.json", encoding="utf-8") as f:
                ID2LABEL = json.load(f)
        except OSError as exc:
            _load_failed = True
            raise IntentModelNotAvailableError(
                f"Intent model not available at '{_MODEL}': {exc}"
            ) from exc


@torch.no_grad()
def predict_intent(text: str) -> str:
    """Return top predicted intent label."""
    _ensure_model_loaded()
    assert _tok is not None and _model is not None and ID2LABEL is not None

    inputs = _tok(text, return_tensors="pt", truncation=True, padding=True)
    logits = _model(**inputs).logits
    return ID2LABEL[str(int(logits.argmax(dim=1)[0]))]


@torch.no_grad()
def intent_with_confidence(text: str) -> Tuple[str, float]:
    """Return (intent_label, confidence_score)."""
    _ensure_model_loaded()
    assert _tok is not None and _model is not None and ID2LABEL is not None

    inputs = _tok(text, return_tensors="pt", truncation=True, padding=True)
    logits = _model(**inputs).logits
    probs = torch.softmax(logits, dim=1)[0]
    idx = int(probs.argmax())
    label = ID2LABEL[str(idx)]
    return label, float(probs[idx])


@torch.no_grad()
def top_intents(text: str, k: int = 3) -> List[Dict]:
    """Return top-k intents with scores. Useful for multi-intent detection."""
    _ensure_model_loaded()
    assert _tok is not None and _model is not None and ID2LABEL is not None

    inputs = _tok(text, return_tensors="pt", truncation=True, padding=True)
    logits = _model(**inputs).logits
    probs = torch.softmax(logits, dim=1)[0]
    
    top_k = torch.topk(probs, k=min(k, len(probs)))
    results = []
    for score, idx in zip(top_k.values, top_k.indices):
        results.append({
            "intent": ID2LABEL[str(int(idx))],
            "confidence": float(score),
        })
    return results
