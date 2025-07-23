import os, warnings, json, datetime, pathlib, torch
from collections import deque
from typing import Deque, Tuple

# ── memory engine ────────────────────────────────────────────────
from memory import add_message, recall              
# ─────────────────────────────────────────────────────────────────

os.environ["TOKENIZERS_PARALLELISM"] = "false"
warnings.filterwarnings("ignore")

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from langchain_qdrant import Qdrant
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

# emotion classifier
from emotion.predict import _model as _emo_model, _tok as _emo_tok

# basic keyword fallback for self‑harm
def is_self_harm(txt: str) -> bool:
    return any(k in txt.lower() for k in ("kill myself", "suicide", "end it"))

# ------------------------------------------------------------------
load_dotenv()
# ------------------------------------------------------------------
LOG_PATH = pathlib.Path("sessions.jsonl")
History = Deque[Tuple[str, str, str]]  # (user, bot, emotion)

def dominant_emotion(hist: History) -> str:
    return hist[-1][2] if hist else "neutral"

def write_session_log(hist: History):
    if not hist:
        return
    entry = {
        "timestamp": datetime.datetime.now().isoformat(timespec="seconds"),
        "dominant_emotion": dominant_emotion(hist),
        "turns": [{"user": u, "slurpy": b, "emotion": e} for u, b, e in hist],
    }
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")

# ------------------------------------------------------------------
FRUITS = {
    "joy": "Mango Mania", "frustrated": "Sour Lemon", "excited": "Pineapple Punch",
    "anxious": "Slippery Banana", "angry": "Fiery Guava", "aggressive": "Spiky Papaya",
    "calm": "Watermelon Wave", "exhausted": "Blueberry Burnout",
    "hopeful": "Grape Expectations", "content": "Peachy Keen", "focused": "Apple Clarity",
    "energetic": "Cherry Charge", "resilient": "Kiwi Comeback", "worried": "Peer Pressure",
    "sad": "Musk Melt", "thoughtful": "Reflective Plum",
    "passionate": "Passionate Pomegranate", "neutral": "Plain Lemon",
}
def fruit_for(emotion: str) -> str:
    return FRUITS.get(emotion, "Plain Lemon")

# ── NEW: tone guide – 1‑liner for LLM style modulation ───────────
TONE_GUIDE = {
    "sad": "Use a gentle, validating tone.",
    "anxious": "Speak calmly and offer reassurance.",
    "angry": "Keep a steady, de‑escalating tone.",
    "frustrated": "Acknowledge feelings and suggest constructive steps.",
    "excited": "Match the enthusiasm and celebrate progress.",
    "joy": "Share the joy and reinforce positivity.",
    "calm": "Maintain a relaxed, reflective tone.",
    "thoughtful": "Engage with curiosity and insight.",
    "energetic": "Keep responses lively and motivating.",
    "neutral": "Maintain a friendly, balanced tone.",
}

# ------------------------------------------------------------------
INDEX_PATH, COLL_CHUNKS = "ed_index_full", "ed_chunks"
embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
client = QdrantClient(path=INDEX_PATH, force_disable_check_same_thread=True)
vs = Qdrant(client=client, collection_name=COLL_CHUNKS, embeddings=embedder)
retriever = vs.as_retriever(search_kwargs={"k": 4})

SUMMARY_COLL = "session_summaries"
summary_vs = Qdrant(client=client, collection_name=SUMMARY_COLL, embeddings=embedder)

# ------------------------------------------------------------------
SYSTEM_SUPPORT = "You are Slurpy, an evidence‑based companion. Use OARS. Keep replies ≤5 sentences."
SUPPORT_TMPL = (
    "Tone: {tone}\n"
    "Context:\n{context}\n\n"
    "History:\n{history}\n\n"
    "Emotion: {emotion} | Fruit: {fruit} | Intensity: {intensity:.2f}\n"
    "User: {question}\nSlurpy:"
)
SUPPORT_PROMPT = ChatPromptTemplate.from_messages([("system", SYSTEM_SUPPORT), ("human", SUPPORT_TMPL)])

SYSTEM_GREET = "You are Slurpy, a friendly companion. Greet naturally; don’t mention fruits."
GREET_PROMPT = ChatPromptTemplate.from_messages([("system", SYSTEM_GREET), ("human", "User: {question}\nSlurpy:")])

llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.6, model_kwargs={"max_tokens": 240})

# ------------------------------------------------------------------
def emotion_intensity(text: str):
    inputs = _emo_tok(text, return_tensors="pt", truncation=True)
    probs = torch.softmax(_emo_model(**inputs).logits, dim=1)[0]
    idx = int(torch.argmax(probs))
    label = _emo_model.config.id2label[idx]
    return label, float(probs[idx])

def format_history(hist: History):
    return "\n".join(f"User: {u}\nSlurpy: {b}" for u, b, _ in hist)

GREETINGS = {"hi", "hey", "yo", "hello", "good morning", "good afternoon", "good evening"}
FAREWELLS = {"bye", "goodbye", "ttyl", "gtg", "see you", "later", "cya"}

def is_greeting(txt: str):  return any(txt.lower().strip().startswith(g) for g in GREETINGS)
def is_farewell(txt: str):  return any(f in txt.lower() for f in FAREWELLS)

# ------------------------------------------------------------------
def slurpy_answer(msg: str, hist: History, user_id: str | None = None):
    """
    Main entry‑point: generate Slurpy’s answer.

    Parameters
    ----------
    msg      : the user’s message
    hist     : short‑term conversational history (deque)
    user_id  : Clerk user ID (fallbacks to “anonymous” for CLI / tests)
    """
    if user_id is None:
        user_id = "anonymous"

    if is_self_harm(msg):
        hotline = "If you’re thinking about self‑harm, please call 988 (US) or your local helpline."
        hist.append((msg, hotline, "crisis"))
        return hotline, "crisis", "Plain Lemon"

    emotion, prob = emotion_intensity(msg)
    fruit = fruit_for(emotion)

    # Retrieve empathic context
    context_docs = retriever.invoke(msg)
    context = "\n---\n".join(d.page_content for d in context_docs)

    # personal memory recall
    recalled = recall(user_id, msg, k=3)
    if recalled:
        mem_block = "\n".join(f"• {line}" for line in recalled)
        context = f"{mem_block}\n====\n{context}"

    tone_instruction = TONE_GUIDE.get(emotion, "Maintain a friendly, balanced tone.")

    prompt = SUPPORT_PROMPT.format(
        context=context,
        history=format_history(hist),
        emotion=emotion,
        fruit=fruit,
        intensity=prob,
        question=msg,
        tone=tone_instruction,
    )
    answer = str(llm.invoke(prompt).content)

    hist.append((msg, answer, emotion))
    if len(hist) > 6:
        hist.popleft()

    add_message(user_id, msg, emotion, fruit, prob)
    return answer, emotion, fruit

# ------------------------------------------------------------------
if __name__ == "__main__":
    mem: History = deque()
    try:
        for d in summary_vs.similarity_search("", k=3):
            mem.append(("— summary —", d.page_content, "neutral"))
    except Exception:
        pass

    while True:
        try:
            user = input("You > ").strip()

            if is_greeting(user):
                greet = str(llm.invoke(GREET_PROMPT.format(question=user)).content)
                print("\nSlurpy:", greet, "\n")
                mem.append((user, greet, mem[-1][2] if mem else "neutral"))
                continue

            if is_farewell(user):
                print("\nSlurpy: It was lovely chatting. Anything else on your mind? (yes/no)\n")
                follow = input("You > ").strip().lower()
                if follow in {"no", "n"} or is_farewell(follow):
                    break
                user = follow

            reply, emo, fruit = slurpy_answer(user, mem)
            print(f"\nSlurpy ({fruit} – {emo}):", reply, "\n")

        except KeyboardInterrupt:
            break

    write_session_log(mem)
    if mem:
        summary = str(llm.invoke("Summarise key points:\n" + format_history(mem)).content)
        try:
            summary_vs.add_texts([summary])
        except Exception:
            pass
    print("\n🌙 Session saved & summarised. Take care.\n")
