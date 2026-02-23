"""
Train Intent Classifier for Therapy Conversations
Fine-tunes DistilBERT on multiple mental health datasets
to classify WHAT the user needs (not how they feel).

Datasets used:
  1. go_emotions (simplified) - repurposed for intent signals
  2. dair-ai/emotion - extra emotional intent coverage
  3. sem_eval_2018_task_1 (subtask5.english) - fine-grained affect
  4. silicone (dyda_da) - dialogue acts (question, inform, etc.)

Outputs → intent/model/

Intent Labels:
  seeking_support     - wants empathy/validation
  seeking_advice      - wants concrete guidance
  venting             - needs to express/release
  crisis              - safety concern
  exploring_feelings  - trying to understand emotions
  relationship_issue  - interpersonal conflict
  daily_struggle      - can't function / daily tasks
  grief_loss          - death/breakup/major loss
  progress_update     - sharing positive change
  skill_practice      - using/asking about coping skills
  sleep_issue         - insomnia/nightmares
  self_worth          - low self-esteem / identity
  trauma_processing   - past trauma surfacing
  existential         - meaning/purpose/direction
  neutral_check_in    - casual / "I'm fine"
"""

import os
import json
import random
import re
import numpy as np
import torch
from collections import Counter
from datasets import Dataset, load_dataset
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
)
from transformers.trainer_utils import EvalPrediction
from evaluate import load as load_metric
from sklearn.model_selection import train_test_split

MODEL_DIR = "intent/model"
os.makedirs(MODEL_DIR, exist_ok=True)

# ── Intent labels ─────────────────────────────────────────────────
INTENT_LABELS = [
    "crisis",
    "daily_struggle",
    "existential",
    "exploring_feelings",
    "grief_loss",
    "neutral_check_in",
    "progress_update",
    "relationship_issue",
    "seeking_advice",
    "seeking_support",
    "self_worth",
    "skill_practice",
    "sleep_issue",
    "trauma_processing",
    "venting",
]

label2id = {label: i for i, label in enumerate(INTENT_LABELS)}
id2label = {i: label for label, i in label2id.items()}

# ── Keyword-based intent mapping ──────────────────────────────────
# Maps text patterns to intent labels for datasets that don't have
# therapy-specific labels. This is a bootstrap approach.

INTENT_PATTERNS = {
    "crisis": [
        r"\b(suicid|kill myself|end it all|want to die|don.t want to live|self.harm|cut myself|overdose)\b",
        r"\b(no reason to live|better off dead|can.t go on|wish i was dead)\b",
    ],
    "sleep_issue": [
        r"\b(can.t sleep|insomnia|nightmare|sleep|awake all night|exhausted|tired)\b",
    ],
    "grief_loss": [
        r"\b(died|death|funeral|passed away|lost my|grieving|mourning|miscarriage)\b",
        r"\b(breakup|broke up|divorce|separated|left me)\b",
    ],
    "relationship_issue": [
        r"\b(boyfriend|girlfriend|partner|husband|wife|spouse|friend.*betray)\b",
        r"\b(argument|fight with|cheated|trust issues|toxic relationship)\b",
        r"\b(my (mom|dad|mother|father|parents?|brother|sister|family).*(?:hate|angry|fight|abuse|yell))\b",
    ],
    "daily_struggle": [
        r"\b(can.t get out of bed|can.t function|can.t eat|can.t focus|can.t concentrate)\b",
        r"\b(missed work|called in sick|can.t do anything|everything.s too much)\b",
    ],
    "self_worth": [
        r"\b(worthless|useless|ugly|hate myself|i.m nothing|failure|not good enough)\b",
        r"\b(nobody loves me|nobody cares|i don.t matter|what.s the point of me)\b",
    ],
    "trauma_processing": [
        r"\b(flashback|trigger|ptsd|abuse|assault|molest|trauma|violated)\b",
        r"\b(nightmares about|can.t forget|haunted by|when i was (a kid|young|little))\b",
    ],
    "skill_practice": [
        r"\b(tried (the|that|breathing|grounding|meditation|journaling))\b",
        r"\b(coping|skill|technique|exercise|practice|mindfulness|dbt|cbt)\b",
        r"\b(worked|helped|didn.t help|should i try)\b",
    ],
    "progress_update": [
        r"\b(feeling better|good day|progress|improved|breakthrough|proud of)\b",
        r"\b(managed to|was able to|finally did|first time in)\b",
    ],
    "existential": [
        r"\b(meaning|purpose|point of (life|living|anything)|direction|lost in life)\b",
        r"\b(who am i|what am i doing|quarter.life|midlife|wasting my life)\b",
    ],
    "seeking_advice": [
        r"\b(what should i|how (do|can|should) i|advice|suggest|recommend|help me with)\b",
        r"\b(what would you|is it normal|any tips)\b",
    ],
    "neutral_check_in": [
        r"\b(i.m (fine|ok|okay|good|alright)|not much|just checking in|nothing new)\b",
        r"\b(hey|hello|hi there|what.s up)\b",
    ],
}

# Fallback: if no pattern matches, use emotion → intent mapping
EMOTION_TO_INTENT = {
    "joy": "progress_update",
    "amusement": "neutral_check_in",
    "approval": "progress_update",
    "gratitude": "progress_update",
    "love": "relationship_issue",
    "relief": "progress_update",
    "desire": "exploring_feelings",
    "excitement": "progress_update",
    "pride": "progress_update",
    "optimism": "progress_update",
    "admiration": "neutral_check_in",
    "sadness": "seeking_support",
    "grief": "grief_loss",
    "disappointment": "venting",
    "remorse": "self_worth",
    "embarrassment": "self_worth",
    "confusion": "exploring_feelings",
    "anger": "venting",
    "disgust": "venting",
    "annoyance": "venting",
    "nervousness": "seeking_support",
    "fear": "seeking_support",
    "realization": "exploring_feelings",
    "curiosity": "seeking_advice",
    "surprise": "exploring_feelings",
    "neutral": "neutral_check_in",
    "caring": "seeking_support",
}


def classify_text_intent(text: str, emotion_label: str = None) -> str:
    """Rule-based intent classification for bootstrapping training data."""
    text_lower = text.lower()

    # Crisis always takes priority
    for pattern in INTENT_PATTERNS.get("crisis", []):
        if re.search(pattern, text_lower):
            return "crisis"

    # Check all other patterns
    matches = []
    for intent, patterns in INTENT_PATTERNS.items():
        if intent == "crisis":
            continue
        for pattern in patterns:
            if re.search(pattern, text_lower):
                matches.append(intent)
                break

    if matches:
        return matches[0]  # First match wins

    # Fallback to emotion-based mapping
    if emotion_label and emotion_label in EMOTION_TO_INTENT:
        return EMOTION_TO_INTENT[emotion_label]

    # Default
    return "seeking_support"


# ── Data collection from multiple sources ─────────────────────────

def collect_go_emotions():
    """GoEmotions → intent labels via pattern matching + emotion mapping."""
    print("📥 Loading GoEmotions...")
    ds = load_dataset("go_emotions", "simplified", split="train")
    label_names = ds.features["labels"].feature.names

    texts, labels = [], []
    for example in ds:
        text = example["text"]
        if len(example["labels"]) != 1:
            continue
        emotion_label = label_names[example["labels"][0]]
        intent = classify_text_intent(text, emotion_label)
        texts.append(text)
        labels.append(intent)

    print(f"  → {len(texts):,} examples from GoEmotions")
    return texts, labels


def collect_dair_emotion():
    """dair-ai/emotion → intent labels via emotion mapping."""
    print("📥 Loading dair-ai/emotion...")
    try:
        ds = load_dataset("dair-ai/emotion", split="train")
    except Exception as e:
        print(f"  ⚠️ Could not load dair-ai/emotion: {e}")
        return [], []

    emotion_map = {0: "sadness", 1: "joy", 2: "love", 3: "anger", 4: "fear", 5: "surprise"}
    texts, labels = [], []
    for example in ds:
        text = example["text"]
        emotion = emotion_map.get(example["label"], "neutral")
        intent = classify_text_intent(text, emotion)
        texts.append(text)
        labels.append(intent)

    print(f"  → {len(texts):,} examples from dair-ai/emotion")
    return texts, labels


def collect_silicone_dialogue_acts():
    """Silicone DyDA → intent labels via dialogue act mapping."""
    print("📥 Loading silicone/dyda_da...")
    try:
        ds = load_dataset("silicone", "dyda_da", split="train")
    except Exception as e:
        print(f"  ⚠️ Could not load silicone: {e}")
        return [], []

    # DyDA dialogue acts: 0=inform, 1=question, 2=directive, 3=commissive
    da_to_intent = {
        0: "venting",           # inform → sharing/venting
        1: "seeking_advice",    # question → seeking guidance
        2: "seeking_advice",    # directive → asking for action
        3: "progress_update",   # commissive → committing to action
    }

    texts, labels = [], []
    for example in ds:
        text = example["Utterance"]
        da = example["Label"]
        # Override with pattern matching first
        intent = classify_text_intent(text)
        if intent == "seeking_support":  # default = use DA mapping
            intent = da_to_intent.get(da, "seeking_support")
        texts.append(text)
        labels.append(intent)

    print(f"  → {len(texts):,} examples from silicone/dyda_da")
    return texts, labels


def generate_synthetic_crisis():
    """Generate synthetic crisis examples (safety-critical, need more data)."""
    print("📥 Generating synthetic crisis examples...")

    crisis_templates = [
        "I want to kill myself",
        "I don't want to live anymore",
        "I'm thinking about ending it all",
        "What's the point of living",
        "I've been having suicidal thoughts",
        "I want to hurt myself",
        "I've been cutting myself",
        "Nobody would miss me if I was gone",
        "I can't do this anymore I want to die",
        "I have a plan to end my life",
        "I took pills to hurt myself",
        "I'm standing on the bridge",
        "I bought a gun to kill myself",
        "Everything would be better without me",
        "I've written my goodbye letters",
        "I don't see a way out",
        "The pain is too much I can't take it",
        "I've been thinking about overdosing",
        "I tried to end it last week",
        "I self-harmed again today",
        "I want the pain to stop permanently",
        "My family would be better off without me",
        "I can't keep going like this",
        "I've been stockpiling medication",
        "I don't deserve to be alive",
    ]

    # Add variations
    variations = []
    for template in crisis_templates:
        variations.append(template)
        variations.append(template.lower())
        variations.append(template + ".")
        variations.append("I just... " + template.lower())
        variations.append(template + " I don't know what to do")

    texts = variations
    labels = ["crisis"] * len(texts)

    print(f"  → {len(texts)} synthetic crisis examples")
    return texts, labels


def generate_synthetic_therapy():
    """Generate therapy-specific examples for underrepresented intents."""
    print("📥 Generating therapy-specific examples...")

    examples = {
        "skill_practice": [
            "I tried the breathing exercise you suggested",
            "I practiced mindfulness this morning",
            "I used the 5-4-3-2-1 grounding technique when I panicked",
            "I journaled every day this week",
            "I noticed my thoughts and tried to challenge them like we discussed",
            "I did the opposite action thing when I wanted to isolate",
            "I used box breathing during my panic attack",
            "I tried to do a thought record but it was hard",
            "The DBT skills are starting to make more sense",
            "I practiced progressive muscle relaxation before bed",
            "I used the STOP skill when I wanted to yell at my partner",
            "I did behavioral activation and went for a walk even though I didn't want to",
            "I tried radical acceptance but I'm struggling with it",
            "I used my distress tolerance kit last night",
            "The body scan meditation actually helped me sleep",
        ],
        "trauma_processing": [
            "I keep having flashbacks about what happened",
            "I was triggered by a sound that reminded me of the abuse",
            "I can't stop thinking about what he did to me when I was young",
            "The memories are getting worse",
            "I had a nightmare about the accident again",
            "Being in that situation reminded me of my childhood",
            "I flinch when someone raises their voice because of what happened",
            "I've never told anyone about the abuse",
            "Sometimes I dissociate when I think about it",
            "I feel like I'm still trapped in that moment",
            "I was sexually assaulted and I can't move past it",
            "My body remembers even when I try to forget",
            "The anniversary of the event is coming up and I'm dreading it",
            "I was in a car accident and now I can't drive",
            "I witnessed something terrible and I can't unsee it",
        ],
        "grief_loss": [
            "My mom died last month and I can't stop crying",
            "I lost my best friend to cancer",
            "My dog died and everyone says I should be over it",
            "My partner left me after 10 years",
            "I had a miscarriage and nobody understands",
            "My dad passed away and we never resolved things",
            "I'm grieving a friendship that ended badly",
            "I lost my job and it feels like losing my identity",
            "My child moved away and the house feels so empty",
            "I was diagnosed with a chronic illness and I'm mourning my old life",
            "The divorce was finalized and I feel lost",
            "My grandmother who raised me just died",
            "I can't accept that they're really gone",
            "holidays are the worst without them",
            "Everyone has moved on but I'm still stuck in grief",
        ],
        "self_worth": [
            "I hate everything about myself",
            "I don't deserve to be happy",
            "Everyone else has it figured out except me",
            "I'm such a failure",
            "Nobody actually likes me they just tolerate me",
            "I look in the mirror and hate what I see",
            "I'm not smart enough for anything",
            "What's the point I'm never going to amount to anything",
            "I compare myself to everyone and always come up short",
            "I don't bring anything to the table",
            "I feel like a burden to everyone around me",
            "I'm fundamentally broken and unlovable",
            "Imposter syndrome is eating me alive",
            "I achieved something but I still feel worthless",
            "I can't accept compliments because I don't believe them",
        ],
        "existential": [
            "What's the point of all this",
            "I don't know who I am anymore",
            "I feel like I'm just going through the motions",
            "Nothing feels meaningful",
            "I'm 30 and have no idea what I want",
            "Is this all there is to life",
            "I achieved everything I was supposed to and I'm still empty",
            "I don't have a purpose",
            "I feel like I'm wasting my life",
            "Everyone seems to know what they want except me",
            "I don't know what I believe in anymore",
            "The world feels meaningless",
            "I'm having a quarter life crisis",
            "I can't figure out what career path to take",
            "I used to have passions but now nothing excites me",
        ],
        "daily_struggle": [
            "I can't get out of bed in the morning",
            "I haven't showered in days",
            "I can't make myself eat",
            "I missed work again because I couldn't function",
            "Simple tasks feel impossible",
            "I can't focus on anything for more than 5 minutes",
            "My apartment is a mess and I can't bring myself to clean",
            "I forgot to pay my bills again",
            "I can't make decisions even about simple things",
            "Everything takes so much energy I don't have",
            "I haven't left the house in a week",
            "I can't keep up with basic responsibilities",
            "Making food feels like climbing a mountain",
            "I'm falling behind on everything",
            "I can't even reply to messages",
        ],
        "sleep_issue": [
            "I haven't slept properly in weeks",
            "I lay awake all night thinking",
            "I keep waking up at 3am and can't fall back asleep",
            "I have nightmares every night",
            "I sleep 12 hours and still feel exhausted",
            "My mind races as soon as I close my eyes",
            "I'm afraid to go to sleep because of the nightmares",
            "I've tried everything but I still can't sleep",
            "Insomnia is ruining my life",
            "I nap during the day and can't sleep at night",
            "The anxiety gets worse at bedtime",
            "I take hours to fall asleep",
            "I wake up feeling more tired than when I went to bed",
            "Sleep medication isn't working anymore",
            "I dread nighttime because I know I won't sleep",
        ],
    }

    all_texts, all_labels = [], []
    for intent, texts in examples.items():
        for text in texts:
            all_texts.append(text)
            all_labels.append(intent)
            # Add variation
            all_texts.append(text.lower())
            all_labels.append(intent)

    print(f"  → {len(all_texts)} synthetic therapy examples")
    return all_texts, all_labels


# ── Main training pipeline ────────────────────────────────────────

def main():
    print("=" * 60)
    print("🧠 Training Intent Classifier for Therapy")
    print("=" * 60)

    # Collect data from all sources
    all_texts, all_labels = [], []

    t1, l1 = collect_go_emotions()
    all_texts.extend(t1); all_labels.extend(l1)

    t2, l2 = collect_dair_emotion()
    all_texts.extend(t2); all_labels.extend(l2)

    t3, l3 = collect_silicone_dialogue_acts()
    all_texts.extend(t3); all_labels.extend(l3)

    t4, l4 = generate_synthetic_crisis()
    all_texts.extend(t4); all_labels.extend(l4)

    t5, l5 = generate_synthetic_therapy()
    all_texts.extend(t5); all_labels.extend(l5)

    print(f"\n📊 Total: {len(all_texts):,} examples")

    # Show distribution
    dist = Counter(all_labels)
    print("\n📊 Label Distribution:")
    for label in INTENT_LABELS:
        count = dist.get(label, 0)
        pct = count / len(all_labels) * 100
        bar = "█" * int(pct)
        print(f"  {label:25s} {count:6,} ({pct:5.1f}%) {bar}")

    # Filter only valid labels
    valid = [(t, l) for t, l in zip(all_texts, all_labels) if l in label2id]
    all_texts = [t for t, _ in valid]
    all_labels = [l for _, l in valid]

    # Balance: oversample underrepresented classes
    min_per_class = 500
    balanced_texts, balanced_labels = [], []
    for label in INTENT_LABELS:
        indices = [i for i, l in enumerate(all_labels) if l == label]
        if len(indices) == 0:
            print(f"  ⚠️ No examples for {label}")
            continue
        if len(indices) < min_per_class:
            # Oversample
            oversampled = random.choices(indices, k=min_per_class)
            for idx in oversampled:
                balanced_texts.append(all_texts[idx])
                balanced_labels.append(all_labels[idx])
        else:
            for idx in indices:
                balanced_texts.append(all_texts[idx])
                balanced_labels.append(all_labels[idx])

    print(f"\n📊 After balancing: {len(balanced_texts):,} examples")

    # Train/val split
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        balanced_texts, balanced_labels, test_size=0.1, stratify=balanced_labels, random_state=42
    )

    print(f"  Train: {len(train_texts):,}  Val: {len(val_texts):,}")

    # Convert to int labels
    train_label_ids = [label2id[l] for l in train_labels]
    val_label_ids = [label2id[l] for l in val_labels]

    # Create HuggingFace datasets
    train_ds = Dataset.from_dict({"text": train_texts, "label": train_label_ids})
    val_ds = Dataset.from_dict({"text": val_texts, "label": val_label_ids})

    # Tokenize
    tok = DistilBertTokenizerFast.from_pretrained("distilbert-base-uncased")

    def encode(batch):
        return tok(batch["text"], truncation=True, max_length=128)

    train_ds = train_ds.map(encode, batched=True).with_format("torch")
    val_ds = val_ds.map(encode, batched=True).with_format("torch")

    # Model
    model = DistilBertForSequenceClassification.from_pretrained(
        "distilbert-base-uncased",
        num_labels=len(INTENT_LABELS),
        id2label=id2label,
        label2id=label2id,
    )

    # Metrics
    metric_acc = load_metric("accuracy")
    metric_f1 = load_metric("f1")

    def compute_metrics(p: EvalPrediction):
        if p.label_ids is None:
            return {}
        preds = np.argmax(p.predictions, axis=-1)
        acc = metric_acc.compute(predictions=preds, references=p.label_ids) or {}
        f1 = metric_f1.compute(predictions=preds, references=p.label_ids, average="weighted") or {}
        return {
            "accuracy": acc.get("accuracy", 0.0),
            "f1": f1.get("f1", 0.0),
        }

    # Training
    use_fp16 = torch.cuda.is_available()
    use_mps = torch.backends.mps.is_available() if hasattr(torch.backends, "mps") else False

    args = TrainingArguments(
        output_dir=MODEL_DIR,
        per_device_train_batch_size=64,
        per_device_eval_batch_size=128,
        num_train_epochs=3,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        save_total_limit=2,
        logging_steps=100,
        fp16=use_fp16,
        learning_rate=3e-5,
        warmup_ratio=0.1,
        weight_decay=0.01,
        use_mps_device=use_mps,
        dataloader_num_workers=0,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=DataCollatorWithPadding(tok),
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    print("\n🚀 Training intent classifier...")
    trainer.train()

    # Save
    trainer.save_model(MODEL_DIR)
    tok.save_pretrained(MODEL_DIR)

    with open(f"{MODEL_DIR}/labels.json", "w") as f:
        json.dump(id2label, f)

    # Final eval
    results = trainer.evaluate()
    print(f"\n✅ Training complete!")
    print(f"   Accuracy: {results.get('eval_accuracy', 0):.3f}")
    print(f"   F1:       {results.get('eval_f1', 0):.3f}")
    print(f"   Saved to: {MODEL_DIR}")


if __name__ == "__main__":
    main()
