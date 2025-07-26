import os, warnings, json, datetime, pathlib, torch
from collections import deque
from typing import Deque, Tuple, List, Optional
import requests
import uuid

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
# 🆕 INSIGHTS INTEGRATION FUNCTIONS
def store_message_insights(user_id: str, session_id: str, message: str, role: str, emotion: str, intensity: float, topics: Optional[List[str]] = None):
    """
    Store message data for insights analysis
    Integrates with your Next.js insights API
    """
    try:
        # Your Next.js API endpoint
        api_url = "http://localhost:3000/api/insights"  # Change to your deployed URL in production
        
        payload = {
            "sessionId": session_id,
            "message": message,
            "role": role,  # "user" or "assistant"
            "emotion": emotion,
            "intensity": intensity,
            "topics": topics or []
        }
        
        # In production, you'd need to include proper auth headers
        # For now, we'll let the API handle auth via Clerk
        response = requests.post(api_url, json=payload, timeout=5)
        
        if response.status_code == 201:
            print(f"✅ Stored {role} message with emotion: {emotion}")
        else:
            print(f"⚠️ Failed to store message: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error storing message insights: {e}")
        # Don't let API failures break the chat experience

def extract_topics_from_message(message: str) -> List[str]:
    """
    Extract topics from a message using simple keyword matching
    You can enhance this with more sophisticated NLP if needed
    """
    # Common therapy/wellness topics
    topic_keywords = {
        "work": ["work", "job", "career", "boss", "colleague", "office", "workplace", "employment"],
        "relationships": ["relationship", "partner", "boyfriend", "girlfriend", "marriage", "family", "dating"],
        "anxiety": ["anxious", "worry", "nervous", "panic", "stress", "overwhelmed", "fear"],
        "depression": ["sad", "depressed", "hopeless", "empty", "lonely", "down"],
        "self-care": ["self-care", "wellness", "meditation", "exercise", "sleep", "health"],
        "goals": ["goal", "dream", "ambition", "future", "plan", "achievement", "success"],
        "health": ["health", "physical", "doctor", "medicine", "illness", "medical"],
        "money": ["money", "financial", "budget", "debt", "salary", "expensive", "cost"],
        "education": ["school", "study", "learn", "education", "college", "university", "class"],
        "social": ["friends", "social", "party", "group", "people", "community"],
        "therapy": ["therapy", "counseling", "mental health", "therapist", "treatment"],
        "emotions": ["feel", "feeling", "emotion", "mood", "angry", "happy", "sad"],
        "crisis": ["crisis", "emergency", "help", "urgent", "serious"]
    }
    
    message_lower = message.lower()
    detected_topics = []
    
    for topic, keywords in topic_keywords.items():
        if any(keyword in message_lower for keyword in keywords):
            detected_topics.append(topic)
    
    return detected_topics

# ------------------------------------------------------------------
# 🎭 PERSONALITY MODES - Your brilliant idea!
PERSONALITY_MODES = {
    "therapist": {
        "emoji": "🧘",
        "name": "Therapist",
        "description": "calm, validating, deeply listening",
        "system_prompt": "You are Slurpy in Therapist mode. Be calm, validating, and deeply listening. Use evidence-based therapeutic approaches. Feel safe and let them vent without judgment.",
        "tone_style": "Use a gentle, professional tone with active listening. Validate feelings and use therapeutic techniques."
    },
    "coach": {
        "emoji": "🥊", 
        "name": "Coach",
        "description": "hype, tough love, progress-driven",
        "system_prompt": "You are Slurpy in Coach mode. Be energetic, motivational, and progress-driven. Help them improve and push them with belief and tough love when needed.",
        "tone_style": "Be energetic and motivational. Focus on action, progress, and believing in their potential."
    },
    "friend": {
        "emoji": "🧑‍🤝‍🧑",
        "name": "Friend", 
        "description": "casual, relatable, goofy",
        "system_prompt": "You are Slurpy in Friend mode. Be casual, relatable, and goofy. Shared struggle, low stakes, high empathy. Talk like a close friend who really gets it.",
        "tone_style": "Be casual, warm, and relatable. Use humor appropriately and speak like a close friend."
    },
    "poet": {
        "emoji": "🎭",
        "name": "Poet",
        "description": "metaphorical, aesthetic, romantic", 
        "system_prompt": "You are Slurpy in Poet mode. Be metaphorical, aesthetic, and romantic. Speak their soul when logic fails. Use beautiful, poetic language.",
        "tone_style": "Use beautiful, metaphorical language. Speak to emotions through imagery and aesthetic expression."
    },
    "monk": {
        "emoji": "🧙",
        "name": "Monk",
        "description": "philosophical, minimal, grounded",
        "system_prompt": "You are Slurpy in Monk mode. Be philosophical, minimal, and grounded. Help them zoom out and embrace stillness. Offer wisdom and perspective.",
        "tone_style": "Speak with philosophical wisdom and minimal words. Focus on perspective, acceptance, and inner peace."
    },
    "lover": {
        "emoji": "❤️",
        "name": "Lover",
        "description": "warm, intimate, soft voice",
        "system_prompt": "You are Slurpy in Lover mode. Be warm, intimate, with a soft voice. Make them feel wanted, seen, and special. Use gentle, loving language.",
        "tone_style": "Be warm, affectionate, and deeply caring. Make them feel valued and special with loving language."
    }
}

DEFAULT_MODE = "friend"

def get_mode_config(mode: str) -> dict:
    """Get personality mode configuration"""
    return PERSONALITY_MODES.get(mode, PERSONALITY_MODES[DEFAULT_MODE])

def get_available_modes():
    """Return available modes for API"""
    return [
        {
            "id": mode_id,
            "emoji": config["emoji"], 
            "name": config["name"],
            "description": config["description"]
        }
        for mode_id, config in PERSONALITY_MODES.items()
    ]

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

# ── Updated tone guide for modes ─────────────────────────────────
def get_tone_instruction(emotion: str, mode: str = DEFAULT_MODE) -> str:
    """Get tone instruction based on emotion and personality mode"""
    mode_config = get_mode_config(mode)
    base_tone = mode_config["tone_style"]
    
    # Emotion-specific adjustments
    emotion_adjustments = {
        "sad": "Be extra gentle and validating.",
        "anxious": "Provide calm reassurance and grounding.", 
        "angry": "Acknowledge the anger without escalating.",
        "frustrated": "Validate frustration and suggest constructive approaches.",
        "excited": "Match some enthusiasm while staying in character.",
        "joy": "Share in the positive emotion appropriately."
    }
    
    emotion_adjust = emotion_adjustments.get(emotion, "")
    return f"{base_tone} {emotion_adjust}".strip()

# ------------------------------------------------------------------
INDEX_PATH, COLL_CHUNKS = "ed_index_full", "ed_chunks"
embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
client = QdrantClient(path=INDEX_PATH, force_disable_check_same_thread=True)
vs = Qdrant(client=client, collection_name=COLL_CHUNKS, embeddings=embedder)
retriever = vs.as_retriever(search_kwargs={"k": 4})

SUMMARY_COLL = "session_summaries"
summary_vs = Qdrant(client=client, collection_name=SUMMARY_COLL, embeddings=embedder)

# ------------------------------------------------------------------
def create_system_prompt(mode: str = DEFAULT_MODE) -> str:
    """Create system prompt for the specified mode"""
    mode_config = get_mode_config(mode)
    return f"{mode_config['system_prompt']} Keep replies ≤5 sentences."

SUPPORT_TMPL = (
    "Mode: {mode} ({mode_emoji} {mode_name})\n"
    "Tone: {tone}\n"
    "Context:\n{context}\n\n"
    "History:\n{history}\n\n"
    "Emotion: {emotion} | Fruit: {fruit} | Intensity: {intensity:.2f}\n"
    "User: {question}\nSlurpy:"
)

def create_support_prompt(mode: str = DEFAULT_MODE):
    """Create mode-specific support prompt"""
    system_prompt = create_system_prompt(mode)
    return ChatPromptTemplate.from_messages([("system", system_prompt), ("human", SUPPORT_TMPL)])

SYSTEM_GREET = "You are Slurpy, a friendly companion. Greet naturally based on your personality mode."
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
def slurpy_answer(msg: str, hist: History, user_id: Optional[str] = None, mode: str = DEFAULT_MODE, session_id: Optional[str] = None):
    """
    Main entry‑point: generate Slurpy's answer with personality mode.
    Enhanced with insights tracking.

    Parameters
    ----------
    msg        : the user's message
    hist       : short‑term conversational history (deque)
    user_id    : Clerk user ID (fallbacks to "anonymous" for CLI / tests)
    mode       : personality mode (therapist, coach, friend, poet, monk, lover)
    session_id : unique session identifier for tracking conversations
    """
    if user_id is None:
        user_id = "anonymous"
    
    if session_id is None:
        session_id = str(uuid.uuid4())  # Generate unique session ID

    mode_config = get_mode_config(mode)

    if is_self_harm(msg):
        # Mode-specific crisis responses
        crisis_responses = {
            "therapist": "I'm very concerned about what you've shared. Please reach out for immediate support: call 988 (US) or your local crisis hotline.",
            "friend": "Hey, I'm really worried about you. This is serious - please call 988 (US) or a crisis hotline right away. You matter so much.",
            "coach": "This is serious. Take action now - call 988 (US) or your local crisis line. This is the most important step you can take.",
            "poet": "In this darkest hour, please know - there are hands waiting to pull you into the light. Call 988 (US) or your local crisis line.",
            "monk": "This suffering is real, but so is the path forward. Please seek guidance: 988 (US) or your local crisis line.",
            "lover": "My heart breaks hearing this. You are precious and deserve care. Please call 988 (US) or your local crisis line."
        }
        hotline = crisis_responses.get(mode, crisis_responses["therapist"])
        hist.append((msg, hotline, "crisis"))
        
        # 🆕 Store crisis message for insights
        topics = extract_topics_from_message(msg)
        store_message_insights(user_id, session_id, msg, "user", "crisis", 1.0, topics)
        store_message_insights(user_id, session_id, hotline, "assistant", "supportive", 0.9, ["crisis", "support"])
        
        return hotline, "crisis", "Emergency Orange"

    emotion, prob = emotion_intensity(msg)
    fruit = fruit_for(emotion)

    # 🆕 Extract topics from user message
    topics = extract_topics_from_message(msg)

    # Retrieve empathic context
    context_docs = retriever.invoke(msg)
    context = "\n---\n".join(d.page_content for d in context_docs)

    # personal memory recall
    recalled = recall(user_id, msg, k=3)
    if recalled:
        mem_block = "\n".join(f"• {line}" for line in recalled)
        context = f"{mem_block}\n====\n{context}"

    tone_instruction = get_tone_instruction(emotion, mode)

    # Create mode-specific prompt
    support_prompt = create_support_prompt(mode)
    
    prompt = support_prompt.format(
        mode=mode,
        mode_emoji=mode_config["emoji"],
        mode_name=mode_config["name"], 
        tone=tone_instruction,
        context=context,
        history=format_history(hist),
        emotion=emotion,
        fruit=fruit,
        intensity=prob,
        question=msg,
    )
    
    answer = str(llm.invoke(prompt).content)

    hist.append((msg, answer, emotion))
    if len(hist) > 6:
        hist.popleft()

    add_message(user_id, msg, emotion, fruit, prob)
    
    # 🆕 Store insights data
    # Store user message
    store_message_insights(user_id, session_id, msg, "user", emotion, prob, topics)
    
    # Analyze assistant response (keep it supportive/therapeutic)
    assistant_emotion = "supportive"  # or you could analyze the assistant's response too
    assistant_topics = ["support", "therapy"] + topics  # Assistant addresses user's topics
    store_message_insights(user_id, session_id, answer, "assistant", assistant_emotion, 0.7, assistant_topics)
    
    return answer, emotion, fruit

# ------------------------------------------------------------------
if __name__ == "__main__":
    mem: History = deque()
    current_mode = DEFAULT_MODE
    current_session_id = str(uuid.uuid4())  # 🆕 Generate session ID for this conversation
    
    print(f"🎭 Slurpy Personality Modes Available:")
    for mode_id, config in PERSONALITY_MODES.items():
        print(f"  {config['emoji']} {config['name']}: {config['description']}")
    print(f"\n🎯 Starting in {PERSONALITY_MODES[current_mode]['name']} mode")
    print(f"📊 Session ID: {current_session_id}")  # 🆕 Show session ID
    print("💡 Type 'mode [name]' to switch modes")
    
    try:
        for d in summary_vs.similarity_search("", k=3):
            mem.append(("— summary —", d.page_content, "neutral"))
    except Exception:
        pass

    while True:
        try:
            user_input = input(f"\n[{PERSONALITY_MODES[current_mode]['emoji']} {PERSONALITY_MODES[current_mode]['name']}] You > ").strip()

            # Handle mode switching
            if user_input.lower().startswith("mode "):
                requested_mode = user_input.lower().replace("mode ", "").strip()
                if requested_mode in PERSONALITY_MODES:
                    current_mode = requested_mode
                    mode_config = PERSONALITY_MODES[current_mode]
                    print(f"\n🎭 Switched to {mode_config['emoji']} {mode_config['name']} mode")
                    continue
                else:
                    print(f"❌ Unknown mode. Available: {', '.join(PERSONALITY_MODES.keys())}")
                    continue

            if is_greeting(user_input):
                greet = str(llm.invoke(GREET_PROMPT.format(question=user_input)).content)
                print(f"\nSlurpy ({PERSONALITY_MODES[current_mode]['name']}):", greet, "\n")
                mem.append((user_input, greet, mem[-1][2] if mem else "neutral"))
                
                # 🆕 Store greeting insights
                store_message_insights("anonymous", current_session_id, user_input, "user", "neutral", 0.5, ["greeting"])
                store_message_insights("anonymous", current_session_id, greet, "assistant", "friendly", 0.7, ["greeting"])
                continue

            if is_farewell(user_input):
                print(f"\nSlurpy ({PERSONALITY_MODES[current_mode]['name']}): It was lovely chatting. Anything else on your mind? (yes/no)\n")
                follow = input("You > ").strip().lower()
                if follow in {"no", "n"} or is_farewell(follow):
                    break
                user_input = follow

            # 🆕 Pass session_id to track conversation
            reply, emo, fruit = slurpy_answer(user_input, mem, user_id="anonymous", mode=current_mode, session_id=current_session_id)
            print(f"\nSlurpy ({fruit} – {emo} – {PERSONALITY_MODES[current_mode]['name']}):", reply, "\n")

        except KeyboardInterrupt:
            break

    write_session_log(mem)
    if mem:
        summary = str(llm.invoke("Summarise key points:\n" + format_history(mem)).content)
        try:
            summary_vs.add_texts([summary])
        except Exception:
            pass
    print(f"\n🌙 Session {current_session_id} saved & summarised. Take care.\n")  # 🆕 Show session ID