import json
import torch
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

_MODEL = "emotion/model"

_tok   = DistilBertTokenizerFast.from_pretrained(_MODEL)
_model = DistilBertForSequenceClassification.from_pretrained(_MODEL)
_model.eval()

with open(f"{_MODEL}/labels.json", encoding="utf-8") as f:
    ID2LABEL = json.load(f)

@torch.no_grad()
def predict_emotion(text: str) -> str:
    inputs = _tok(text, return_tensors="pt", truncation=True, padding=True)
    logits = _model(**inputs).logits
    return ID2LABEL[str(int(logits.argmax(dim=1)[0]))]

@torch.no_grad()
def emotion_intensity(text: str) -> tuple[str, float]:
    """
    Returns (predicted_label, confidence_score)
    where confidence_score ∈ [0.0, 1.0].
    """
    inputs = _tok(text, return_tensors="pt", truncation=True, padding=True)
    logits = _model(**inputs).logits
    probs = torch.softmax(logits, dim=1)[0]
    idx = int(probs.argmax())
    label = ID2LABEL[str(idx)]
    return label, float(probs[idx])
