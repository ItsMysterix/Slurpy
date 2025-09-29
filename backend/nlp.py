# backend/nlp.py
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple, Mapping, Sequence, cast
from functools import lru_cache

import spacy
from spacy.language import Language
from spacy.tokens import Doc

from transformers.pipelines import pipeline

# ---------- Lazy singletons (thread-safe enough for uvicorn workers) ----------

@lru_cache(maxsize=1)
def _nlp() -> Language:
    # en_core_web_sm is preinstalled in the image
    return spacy.load("en_core_web_sm")

@lru_cache(maxsize=1)
def _sentiment_pipe():
    # 3-class sentiment: POSITIVE / NEUTRAL / NEGATIVE
    return pipeline(
        "text-classification",
        model="cardiffnlp/twitter-roberta-base-sentiment-latest",
        top_k=None,  # return all scores (new API; replaces return_all_scores=True)
    )

@lru_cache(maxsize=1)
def _emotion_pipe():
    # Public GoEmotions model (replaces the old joeddav repo)
    return pipeline(
        "text-classification",
        model="SamLowe/roberta-base-go_emotions",
        top_k=None,  # return all scores
    )

@lru_cache(maxsize=1)
def _toxicity_pipe():
    return pipeline(
        "text-classification",
        model="unitary/unbiased-toxic-roberta",
        top_k=None,  # return all scores
    )

# ---------- Helpers ----------

_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE_RE = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b")
_URL_RE   = re.compile(r"\bhttps?://\S+\b", re.I)

PII_ENTITY_LABELS = {"PERSON", "GPE", "LOC", "ORG"}
SAFE_REPLACER = "▇▇"

def _clip(x: float) -> float:
    try:
        f = float(x)
    except Exception:
        f = 0.0
    return 0.0 if f < 0 else 1.0 if f > 1 else f

def _topk(
    scores: Sequence[Mapping[str, Any]] | Sequence[Sequence[Mapping[str, Any]]],
    k: int = 5,
) -> List[Tuple[str, float]]:
    """
    Normalizes outputs from transformers pipelines when top_k=None.
    Input shape is typically: [[{"label": "...", "score": 0.x}, ...]]
    """
    if not scores:
        return []
    first = scores[0]
    if isinstance(first, (list, tuple)):
        seq = cast(Sequence[Mapping[str, Any]], first)
        items = [(str(d["label"]), float(d["score"])) for d in seq if isinstance(d, Mapping) and "label" in d and "score" in d]
    elif isinstance(first, Mapping):
        seq = cast(Sequence[Mapping[str, Any]], scores)
        items = [(str(d["label"]), float(d["score"])) for d in seq if "label" in d and "score" in d]
    else:
        return []
    items.sort(key=lambda t: t[1], reverse=True)
    return items[:k]

def _keyphrases(doc: Doc, limit: int = 8) -> List[str]:
    phrases = set()
    for nc in doc.noun_chunks:
        s = nc.text.strip()
        if 3 <= len(s) <= 60:
            phrases.add(s.lower())
    for ent in doc.ents:
        if ent.label_ in {"ORG", "PRODUCT", "WORK_OF_ART", "EVENT", "PERSON", "GPE"}:
            phrases.add(ent.text.strip())
    return sorted(phrases, key=lambda s: (-len(s), s))[:limit]

def redact(text: str) -> str:
    t = _EMAIL_RE.sub(SAFE_REPLACER, text)
    t = _PHONE_RE.sub(SAFE_REPLACER, t)
    t = _URL_RE.sub(SAFE_REPLACER, t)

    doc = _nlp()(t)
    out: List[str] = []
    for tok in doc:
        out.append(SAFE_REPLACER if tok.ent_type_ in PII_ENTITY_LABELS else tok.text)
        out.append(tok.whitespace_)
    return "".join(out)

# ---------- Public API ----------

def analyze_text(text: str) -> Dict[str, Any]:
    """
    Returns:
      {
        "tokens":    [{"text","lemma","pos","ent"}...],
        "entities":  [{"text","label","start","end"}...],
        "keyphrases":[str],
        "sentiment": {"label","score","pos","neu","neg"},
        "emotion":   {"top": str, "scores": [{"label","score"}...]},
        "toxicity":  {"score": float, "labels":[{"label","score"}...]}
      }
    """
    # spaCy
    doc = _nlp()(text)
    tokens = [{"text": t.text, "lemma": t.lemma_, "pos": t.pos_, "ent": t.ent_type_ or None} for t in doc]
    entities = [{"text": e.text, "label": e.label_, "start": e.start_char, "end": e.end_char} for e in doc.ents]
    keyphr = _keyphrases(doc)

    # Sentiment
    s_scores = _sentiment_pipe()(text)
    s_top = _topk(s_scores, k=3)
    tri = {lbl.lower()[:3]: sc for lbl, sc in s_top}
    sentiment = {
        "label": s_top[0][0] if s_top else "NEUTRAL",
        "score": _clip(s_top[0][1]) if s_top else 0.5,
        "pos": _clip(tri.get("pos", 0.0)),
        "neu": _clip(tri.get("neu", 0.0)),
        "neg": _clip(tri.get("neg", 0.0)),
    }

    # Emotion (GoEmotions)
    e_scores = _emotion_pipe()(text)
    e_top = _topk(e_scores, k=5)
    emotion = {
        "top": e_top[0][0] if e_top else "neutral",
        "scores": [{"label": l, "score": _clip(s)} for l, s in e_top],
    }

    # Toxicity
    t_scores = _toxicity_pipe()(text)
    t_top = _topk(t_scores, k=5)
    tox = 0.0
    for l, s in t_top:
        if "toxic" in l.lower():
            tox = max(tox, s)
    toxicity = {"score": _clip(tox), "labels": [{"label": l, "score": _clip(s)} for l, s in t_top]}

    return {
        "tokens": tokens,
        "entities": entities,
        "keyphrases": keyphr,
        "sentiment": sentiment,
        "emotion": emotion,
        "toxicity": toxicity,
    }

def analyze_and_redact(text: str) -> Dict[str, Any]:
    data = analyze_text(text)
    data["redacted"] = redact(text)
    return data

def warmup_nlp() -> None:
    # Call on startup to avoid first-request latency
    _ = _nlp()
    _ = _sentiment_pipe()
    _ = _emotion_pipe()
    _ = _toxicity_pipe()
