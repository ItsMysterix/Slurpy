"""
Severity/Distress Detector for Therapy Conversations.

Measures HOW intense the user's distress is on a 0-1 scale.
Uses a regression head on DistilBERT.

Training Data:
  - GoEmotions mapped to severity (neutral=0, grief/fear=0.8+)
  - Synthetic crisis data (severity=1.0)
  - Synthetic mild data (severity=0.1-0.3)

Outputs → severity/model/

Severity Scale:
  0.0-0.2  = minimal (doing okay)
  0.2-0.4  = mild (some discomfort)
  0.4-0.6  = moderate (needs support)
  0.6-0.8  = high (significant distress)
  0.8-1.0  = severe/crisis (immediate attention)
"""

import os
import json
import random
import numpy as np
import torch
from datasets import Dataset, load_dataset
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
)
from transformers.trainer_utils import EvalPrediction
from sklearn.model_selection import train_test_split

MODEL_DIR = "severity/model"
os.makedirs(MODEL_DIR, exist_ok=True)

# ── Emotion → severity mapping ───────────────────────────────────
# GoEmotions labels mapped to approximate severity scores.
EMOTION_SEVERITY = {
    "joy": 0.05,
    "amusement": 0.05,
    "approval": 0.1,
    "gratitude": 0.05,
    "love": 0.1,
    "relief": 0.15,
    "desire": 0.2,
    "excitement": 0.1,
    "pride": 0.1,
    "optimism": 0.1,
    "admiration": 0.1,
    "curiosity": 0.15,
    "surprise": 0.2,
    "realization": 0.25,
    "neutral": 0.1,
    "caring": 0.15,
    "confusion": 0.35,
    "embarrassment": 0.4,
    "disappointment": 0.45,
    "annoyance": 0.35,
    "disapproval": 0.35,
    "remorse": 0.5,
    "nervousness": 0.5,
    "sadness": 0.6,
    "anger": 0.55,
    "disgust": 0.45,
    "fear": 0.65,
    "grief": 0.8,
}

# ── Data collection ──────────────────────────────────────────────

def collect_go_emotions_severity():
    """Map GoEmotions to severity scores."""
    print("📥 Loading GoEmotions for severity...")
    ds = load_dataset("go_emotions", "simplified", split="train")
    label_names = ds.features["labels"].feature.names

    texts, scores = [], []
    for example in ds:
        text = example["text"]
        if len(example["labels"]) != 1:
            continue
        emotion = label_names[example["labels"][0]]
        severity = EMOTION_SEVERITY.get(emotion)
        if severity is None:
            continue
        # Add noise so model learns range, not exact values
        noise = random.gauss(0, 0.05)
        severity = max(0.0, min(1.0, severity + noise))
        texts.append(text)
        scores.append(severity)

    print(f"  → {len(texts):,} examples")
    return texts, scores


def collect_dair_severity():
    """Map dair-ai/emotion to severity."""
    print("📥 Loading dair-ai/emotion for severity...")
    try:
        ds = load_dataset("dair-ai/emotion", split="train")
    except Exception as e:
        print(f"  ⚠️ Could not load: {e}")
        return [], []

    # 0=sadness, 1=joy, 2=love, 3=anger, 4=fear, 5=surprise
    severity_map = {0: 0.6, 1: 0.05, 2: 0.1, 3: 0.55, 4: 0.65, 5: 0.2}

    texts, scores = [], []
    for example in ds:
        text = example["text"]
        base = severity_map.get(example["label"], 0.3)
        noise = random.gauss(0, 0.05)
        severity = max(0.0, min(1.0, base + noise))
        texts.append(text)
        scores.append(severity)

    print(f"  → {len(texts):,} examples")
    return texts, scores


def generate_severity_spectrum():
    """Generate examples across the full severity spectrum."""
    print("📥 Generating severity spectrum data...")

    spectrum = {
        # Minimal (0.0-0.2)
        0.05: [
            "Had a great day today",
            "I'm feeling pretty good",
            "Things are going well",
            "I had fun with friends today",
            "Feeling positive about things",
            "I'm happy with how today went",
            "Good news at work today",
            "I'm excited about the weekend",
            "Feeling grateful for my friends",
            "I accomplished something today",
        ],
        0.15: [
            "Just a normal day nothing special",
            "I'm okay I guess",
            "Things could be better but I'm fine",
            "Feeling alright today",
            "Nothing to complain about really",
            "Same old same old",
            "Just checking in",
            "Not much going on",
            "I'm doing alright",
            "Average day",
        ],
        # Mild (0.2-0.4)
        0.25: [
            "I'm a little worried about the exam",
            "Feeling slightly stressed about work",
            "I had a minor disagreement with a friend",
            "Feeling a bit down today",
            "Slightly anxious about tomorrow",
            "I'm a little lonely today",
            "Minor frustration at work",
            "Feeling a bit off today",
            "Small argument with my partner",
            "A little nervous about the meeting",
        ],
        0.35: [
            "I've been feeling stressed lately",
            "My anxiety has been acting up a bit",
            "I'm worried about my relationship",
            "Feeling more sad than usual these days",
            "Work stress is getting to me",
            "I've been sleeping poorly",
            "Feeling disconnected from people",
            "I'm struggling with motivation",
            "Things feel harder than they should",
            "I've been irritable with everyone",
        ],
        # Moderate (0.4-0.6)
        0.45: [
            "I can't stop worrying about everything",
            "I've been crying a lot lately",
            "My anxiety keeps me up at night",
            "I feel like I'm failing at everything",
            "I don't enjoy anything anymore",
            "I've been having panic attacks",
            "Everything feels pointless",
            "I can't concentrate on anything",
            "I feel trapped in my situation",
            "My mood swings are out of control",
        ],
        0.55: [
            "I can't get out of bed most days",
            "I haven't eaten properly in days",
            "I've been isolating myself completely",
            "The anxiety is constant and overwhelming",
            "I feel completely numb inside",
            "I can't function at work anymore",
            "I broke down crying at work today",
            "I feel like I'm drowning",
            "I can't face anyone right now",
            "Everything is falling apart",
        ],
        # High (0.6-0.8)
        0.65: [
            "I feel completely hopeless about my life",
            "I can't see a way out of this pain",
            "I haven't left my house in two weeks",
            "I'm having intrusive thoughts constantly",
            "I feel like I'm going crazy",
            "The depression is consuming me",
            "I can't stop the panic attacks",
            "I feel like a burden to everyone",
            "I'm losing grip on reality",
            "I don't know how much more I can take",
        ],
        0.75: [
            "I feel like there's no hope left",
            "I don't want to wake up tomorrow",
            "I've been thinking about hurting myself",
            "Nothing will ever get better",
            "I'm in so much pain I can't bear it",
            "I feel completely broken and worthless",
            "I've given up on everything",
            "I can't stop thinking about death",
            "I'm at my absolute breaking point",
            "I feel like I'm already dead inside",
        ],
        # Severe/Crisis (0.8-1.0)
        0.85: [
            "I want to hurt myself tonight",
            "I've been cutting again",
            "I don't want to be alive",
            "I'm thinking about ending it",
            "I took extra pills on purpose",
            "I've been planning how to do it",
            "Nobody would care if I disappeared",
            "I can't take the pain anymore I want it to stop forever",
            "I've written goodbye letters",
            "I have the means to end it",
        ],
        0.95: [
            "I'm going to kill myself tonight",
            "I have a plan and I'm ready to go through with it",
            "I took all my pills",
            "I'm standing on the bridge right now",
            "I've already started hurting myself",
            "This is the last time anyone will hear from me",
            "I overdosed and I don't want help",
            "I slit my wrists",
            "I'm going to jump",
            "I bought a gun to kill myself today",
        ],
    }

    all_texts, all_scores = [], []
    for base_score, examples in spectrum.items():
        for text in examples:
            # Add variations
            for _ in range(3):
                noise = random.gauss(0, 0.03)
                score = max(0.0, min(1.0, base_score + noise))
                all_texts.append(text)
                all_scores.append(score)
            # Also add lowercase variant
            all_texts.append(text.lower())
            all_scores.append(base_score)

    print(f"  → {len(all_texts)} spectrum examples")
    return all_texts, all_scores


# ── Custom regression trainer ─────────────────────────────────────

class SeverityTrainer(Trainer):
    """Custom trainer that uses MSE loss for regression."""

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels").float()
        outputs = model(**inputs)
        # Use first logit as severity score
        logits = outputs.logits.squeeze(-1)
        loss = torch.nn.functional.mse_loss(logits, labels)
        return (loss, outputs) if return_outputs else loss


# ── Main ──────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("🧠 Training Severity/Distress Detector")
    print("=" * 60)

    all_texts, all_scores = [], []

    t1, s1 = collect_go_emotions_severity()
    all_texts.extend(t1); all_scores.extend(s1)

    t2, s2 = collect_dair_severity()
    all_texts.extend(t2); all_scores.extend(s2)

    t3, s3 = generate_severity_spectrum()
    all_texts.extend(t3); all_scores.extend(s3)

    print(f"\n📊 Total: {len(all_texts):,} examples")

    # Distribution check
    bins = [0, 0.2, 0.4, 0.6, 0.8, 1.01]
    bin_labels = ["minimal", "mild", "moderate", "high", "severe"]
    counts = np.histogram(all_scores, bins=bins)[0]
    print("\n📊 Severity Distribution:")
    for label, count in zip(bin_labels, counts):
        pct = count / len(all_scores) * 100
        bar = "█" * int(pct / 2)
        print(f"  {label:12s} {count:6,} ({pct:5.1f}%) {bar}")

    # Train/val split
    train_texts, val_texts, train_scores, val_scores = train_test_split(
        all_texts, all_scores, test_size=0.1, random_state=42
    )
    print(f"\n  Train: {len(train_texts):,}  Val: {len(val_texts):,}")

    # Create datasets
    train_ds = Dataset.from_dict({"text": train_texts, "label": train_scores})
    val_ds = Dataset.from_dict({"text": val_texts, "label": val_scores})

    # Tokenize
    tok = DistilBertTokenizerFast.from_pretrained("distilbert-base-uncased")

    def encode(batch):
        return tok(batch["text"], truncation=True, max_length=128)

    train_ds = train_ds.map(encode, batched=True).with_format("torch")
    val_ds = val_ds.map(encode, batched=True).with_format("torch")

    # Model (1 output = severity score)
    model = DistilBertForSequenceClassification.from_pretrained(
        "distilbert-base-uncased",
        num_labels=1,
        problem_type="regression",
    )

    # Metrics
    def compute_metrics(p: EvalPrediction):
        preds = p.predictions.squeeze()
        labels = p.label_ids
        mse = float(np.mean((preds - labels) ** 2))
        mae = float(np.mean(np.abs(preds - labels)))
        return {"mse": mse, "mae": mae}

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
        metric_for_best_model="mae",
        greater_is_better=False,
        save_total_limit=2,
        logging_steps=100,
        fp16=use_fp16,
        learning_rate=2e-5,
        warmup_ratio=0.1,
        weight_decay=0.01,
        use_mps_device=use_mps,
        dataloader_num_workers=0,
    )

    trainer = SeverityTrainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=DataCollatorWithPadding(tok),
        compute_metrics=compute_metrics,
    )

    print("\n🚀 Training severity detector...")
    trainer.train()

    # Save
    trainer.save_model(MODEL_DIR)
    tok.save_pretrained(MODEL_DIR)

    # Save metadata
    meta = {
        "type": "severity_regression",
        "scale": "0.0 (minimal) to 1.0 (crisis)",
        "bins": {
            "minimal": "0.0-0.2",
            "mild": "0.2-0.4",
            "moderate": "0.4-0.6",
            "high": "0.6-0.8",
            "severe": "0.8-1.0",
        },
    }
    with open(f"{MODEL_DIR}/meta.json", "w") as f:
        json.dump(meta, f)

    # Final eval
    results = trainer.evaluate()
    print(f"\n✅ Training complete!")
    print(f"   MSE: {results.get('eval_mse', 0):.4f}")
    print(f"   MAE: {results.get('eval_mae', 0):.4f}")
    print(f"   Saved to: {MODEL_DIR}")


if __name__ == "__main__":
    main()
