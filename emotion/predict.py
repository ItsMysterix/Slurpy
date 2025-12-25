import json
import threading
from typing import Tuple

import torch
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

_MODEL = "emotion/model"

# Globals populated on first use by _ensure_model_loaded().
_tok = None
_model = None
ID2LABEL = None
_load_lock = threading.Lock()
_load_failed = False


class ModelNotAvailableError(RuntimeError):
    """Raised when the model files are not available on disk or failed to load."""


def _ensure_model_loaded() -> None:
    """Lazy-loads tokenizer, model and labels. Safe to call multiple times.

    If loading fails (missing files), sets _load_failed and raises ModelNotAvailableError.
    This prevents import-time failures and allows the application to start even when
    model artifacts are not present; requests will receive an explicit error instead.
    """
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
            # Mark load as failed to avoid repeated load attempts.
            _load_failed = True
            raise ModelNotAvailableError(
                f"Emotion model is not available at '{_MODEL}': {exc}"
            ) from exc


@torch.no_grad()
def predict_emotion(text: str) -> str:
    """Return predicted emotion label for the provided text.

    Raises ModelNotAvailableError when model artifacts are missing.
    """
    _ensure_model_loaded()
    assert _tok is not None and _model is not None and ID2LABEL is not None
    inputs = _tok(text, return_tensors="pt", truncation=True, padding=True)
    logits = _model(**inputs).logits
    return ID2LABEL[str(int(logits.argmax(dim=1)[0]))]


@torch.no_grad()
def emotion_intensity(text: str) -> Tuple[str, float]:
    """
    Returns (predicted_label, confidence_score)
    where confidence_score ∈ [0.0, 1.0].
    Raises ModelNotAvailableError when model artifacts are missing.
    """
    _ensure_model_loaded()
    assert _tok is not None and _model is not None and ID2LABEL is not None
    inputs = _tok(text, return_tensors="pt", truncation=True, padding=True)
    logits = _model(**inputs).logits
    probs = torch.softmax(logits, dim=1)[0]
    idx = int(probs.argmax())
    label = ID2LABEL[str(idx)]
    return label, float(probs[idx])
