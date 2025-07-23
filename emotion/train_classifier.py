"""
Fine-tune DistilBERT on GoEmotions (remapped to custom 18-fruit-flavor emotions)
Outputs → emotion/model/
"""
import torch
import os, json, numpy as np
from datasets import load_dataset  # removed Dataset import to avoid type conflict
from transformers.training_args import TrainingArguments
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
)
from transformers.trainer import Trainer
from transformers.data.data_collator import DataCollatorWithPadding
from transformers.trainer_utils import EvalPrediction
from evaluate import load as load_metric

MODEL_DIR = "emotion/model"
os.makedirs(MODEL_DIR, exist_ok=True)

# ── 1. load splits (no streaming) ────────────────────────────────
# removed type annotation that caused Pylance conflict
train_ds = load_dataset(
    "go_emotions", "simplified", split="train", streaming=False
)
val_ds = load_dataset(
    "go_emotions", "simplified", split="validation", streaming=False
)

# original label names
label_names = train_ds.features["labels"].feature.names

# ── 2. remap GoEmotions → 18 custom emotions ─────────────────────
GO_TO_FRUIT_EMO = {
    "joy": "joy",
    "amusement": "joy",
    "fun": "joy",
    "approval": "joy",
    "gratitude": "joy",
    "love": "joy",
    "relief": "joy",
    "desire": "passionate",
    "excitement": "excited",
    "pride": "excited",
    "optimism": "hopeful",
    "admiration": "passionate",
    "sadness": "sad",
    "grief": "sad",
    "disappointment": "sad",
    "remorse": "sad",
    "embarrassment": "sad",
    "confusion": "thoughtful",
    "anger": "angry",
    "disgust": "angry",
    "annoyance": "frustrated",
    "nervousness": "anxious",
    "fear": "anxious",
    "realization": "thoughtful",
    "curiosity": "focused",
    "surprise": "energetic",
    "neutral": "neutral",
    "caring": "calm",
}

fruit_emotions = sorted(set(GO_TO_FRUIT_EMO.values()))
label2id = {label: i for i, label in enumerate(fruit_emotions)}
id2label = {i: label for label, i in label2id.items()}

# ── 3. filter + remap labels ─────────────────────────────────────
def map_to_fruit_emotion(example):
    if len(example["labels"]) != 1:
        return None
    original_label = label_names[example["labels"][0]]
    mapped = GO_TO_FRUIT_EMO.get(original_label)
    if mapped is None:
        return None
    example["label"] = mapped
    return example

train_ds = train_ds.map(map_to_fruit_emotion).filter(lambda x: x is not None)
val_ds   = val_ds.map(map_to_fruit_emotion).filter(lambda x: x is not None)

# ── 4. tokenise ──────────────────────────────────────────────────
tok = DistilBertTokenizerFast.from_pretrained("distilbert-base-uncased")

def encode(batch):
    return tok(batch["text"], truncation=True)

train_ds = train_ds.map(encode, batched=True)
val_ds   = val_ds.map(encode, batched=True)

# map string label → int id
def encode_labels(example):
    example["label"] = label2id[example["label"]]
    return example

train_ds = train_ds.map(encode_labels).with_format("torch")
val_ds   = val_ds.map(encode_labels).with_format("torch")

# ── 5. model ──────────────────────────────────────────────────────
model = DistilBertForSequenceClassification.from_pretrained(
    "distilbert-base-uncased",
    num_labels=len(label2id),
    id2label=id2label,
    label2id=label2id,
)

# ── 6. metrics ───────────────────────────────────────────────────
metric_acc = load_metric("accuracy")
metric_f1  = load_metric("f1")

def compute_metrics(p: EvalPrediction):
    if p.label_ids is None:
        return {}
    preds = np.argmax(p.predictions, axis=-1)

    acc_res = metric_acc.compute(predictions=preds, references=p.label_ids) or {}
    f1_res  = metric_f1.compute(predictions=preds, references=p.label_ids, average="weighted") or {}

    return {
        "accuracy": acc_res.get("accuracy", 0.0),
        "f1":       f1_res.get("f1", 0.0),
    }

# ── 7. training args ────────────────────────────────────────────
use_fp16 = torch.cuda.is_available()

args = TrainingArguments(
    output_dir=MODEL_DIR,
    per_device_train_batch_size=32,
    per_device_eval_batch_size=64,
    num_train_epochs=3,
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    save_total_limit=2,
    logging_steps=100,
    fp16=use_fp16,
)

trainer = Trainer(
    model=model,
    args=args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    data_collator=DataCollatorWithPadding(tok),
    compute_metrics=compute_metrics,
)

# ── 8. train & save ─────────────────────────────────────────────
trainer.train()
trainer.save_model(MODEL_DIR)
tok.save_pretrained(MODEL_DIR)

with open(f"{MODEL_DIR}/labels.json", "w") as f:
    json.dump(id2label, f)

print("✅  Fine-tune complete →", MODEL_DIR)
