"""
Severity/Distress prediction for therapy conversations.

Usage:
    from severity.predict import predict_severity, severity_level
    
    score = predict_severity("I can't get out of bed")
    # → 0.55
    
    level, score = severity_level("I want to kill myself")
    # → ("severe", 0.93)
"""

import json
import threading
from typing import Tuple

import torch
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

_MODEL = "severity/model"

_tok = None
_model = None
_load_lock = threading.Lock()
_load_failed = False


class SeverityModelNotAvailableError(RuntimeError):
    """Raised when severity model files are missing."""


def _ensure_model_loaded() -> None:
    """Lazy-load tokenizer and model. Thread-safe."""
    global _tok, _model, _load_failed

    if _model is not None or _load_failed:
        return

    with _load_lock:
        if _model is not None or _load_failed:
            return
        try:
            _tok = DistilBertTokenizerFast.from_pretrained(_MODEL)
            _model = DistilBertForSequenceClassification.from_pretrained(_MODEL)
            _model.eval()
        except OSError as exc:
            _load_failed = True
            raise SeverityModelNotAvailableError(
                f"Severity model not available at '{_MODEL}': {exc}"
            ) from exc


@torch.no_grad()
def predict_severity(text: str) -> float:
    """Return severity score 0.0-1.0."""
    _ensure_model_loaded()
    assert _tok is not None and _model is not None

    inputs = _tok(text, return_tensors="pt", truncation=True, padding=True)
    logits = _model(**inputs).logits
    score = float(torch.sigmoid(logits.squeeze()))
    return max(0.0, min(1.0, score))


@torch.no_grad()
def severity_level(text: str) -> Tuple[str, float]:
    """Return (severity_level, score).
    
    Levels: minimal, mild, moderate, high, severe
    """
    score = predict_severity(text)

    if score < 0.2:
        level = "minimal"
    elif score < 0.4:
        level = "mild"
    elif score < 0.6:
        level = "moderate"
    elif score < 0.8:
        level = "high"
    else:
        level = "severe"

    return level, score
