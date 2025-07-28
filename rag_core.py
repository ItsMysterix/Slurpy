# -*- coding: utf-8 -*-
"""
rag_core.py — Fixed Slurpy chat core with humanized responses and better memory

Key improvements:
- More natural, varied responses that avoid repetition
- Better memory integration and personalization
- Context-aware conversation flow
- Reduced robotic patterns
- Enhanced emotional intelligence
- Fixed all type errors
"""

import os, warnings, json, datetime, pathlib, torch, requests, uuid, time, re, sqlite3, random
from collections import deque
from typing import Deque, Tuple, List, Optional, Dict, Any
from contextlib import contextmanager

# Qdrant Cloud user memory
from memory import add_message, recall

os.environ["TOKENIZERS_PARALLELISM"] = "false"
warnings.filterwarnings("ignore")

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from langchain_qdrant import Qdrant
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

# emotion classifier
from emotion.predict import _model as _emo_model, _tok as _emo_tok

# ────────────────────────────────────────────────────────────────────────────
# Enhanced conversation patterns and variety
CONVERSATION_STARTERS: Dict[str, List[str]] = {
    "supportive": [
        "I'm really glad you reached out to me.",
        "Thank you for sharing that with me.",
        "I can hear that this is important to you.",
        "It sounds like you're going through something tough.",
        "I'm here and I'm listening."
    ],
    "curious": [
        "That's interesting - tell me more about that.",
        "I'd love to understand better.",
        "Help me understand what that's like for you.",
        "What's that experience been like?",
        "How are you feeling about all this?"
    ],
    "validating": [
        "That sounds really difficult.",
        "Your feelings about this make complete sense.",
        "It's understandable that you'd feel that way.",
        "That must be really hard to deal with.",
        "You're not alone in feeling like this."
    ],
    "encouraging": [
        "You're being really brave by talking about this.",
        "I can see how much strength you have.",
        "It takes courage to share something like that.",
        "You're handling this better than you think.",
        "I'm proud of you for reaching out."
    ]
}

CONVERSATION_ENDERS: Dict[str, List[str]] = {
    "gentle": [
        "What feels most important to focus on right now?",
        "How can I best support you with this?",
        "What would be helpful for you to hear?",
        "Is there a particular part of this you'd like to explore?",
        "What's one small step that might help?"
    ],
    "check_in": [
        "How are you doing with all of this?",
        "What's going through your mind right now?",
        "How does talking about this feel?",
        "What else is on your heart?",
        "Is there more you'd like to share about this?"
    ]
}

def get_varied_response_start(category: str, avoid_recent: Optional[List[str]] = None) -> str:
    """Get a varied conversation starter, avoiding recent ones"""
    options = CONVERSATION_STARTERS.get(category, CONVERSATION_STARTERS["supportive"])
    if avoid_recent:
        filtered_options = []
        for opt in options:
            should_avoid = False
            for recent in avoid_recent:
                if any(word in opt.lower() for word in recent.lower().split()[:3]):
                    should_avoid = True
                    break
            if not should_avoid:
                filtered_options.append(opt)
        options = filtered_options if filtered_options else options
    return random.choice(options)

def get_varied_follow_up(category: str) -> str:
    """Get a varied follow-up question"""
    options = CONVERSATION_ENDERS.get(category, CONVERSATION_ENDERS["gentle"])
    return random.choice(options)

# ────────────────────────────────────────────────────────────────────────────
# Memory integration helpers
def get_personalized_context(user_id: str, current_msg: str) -> str:
    """Get personalized context based on user's history"""
    memories = recall(user_id, current_msg, k=5)
    if not memories:
        return ""
    
    # Organize memories by relevance and recency
    memory_context = "Previous conversations show:\n"
    for i, memory in enumerate(memories[:3]):
        memory_context += f"• {memory}\n"
    
    return memory_context

def extract_conversation_themes(user_msg: str, memories: List[str]) -> List[str]:
    """Extract ongoing themes from current message and memories"""
    themes: List[str] = []
    
    # Common therapy themes
    theme_keywords: Dict[str, List[str]] = {
        "anxiety": ["anxious", "worry", "nervous", "panic", "stress", "overwhelmed", "fear"],
        "depression": ["sad", "depressed", "hopeless", "empty", "lonely", "down", "worthless"],
        "relationships": ["relationship", "partner", "friend", "family", "conflict", "breakup"],
        "work_stress": ["work", "job", "boss", "career", "deadline", "pressure"],
        "self_esteem": ["confidence", "self-worth", "insecure", "doubt", "failure"],
        "trauma": ["trauma", "abuse", "ptsd", "flashback", "triggered"],
        "grief": ["loss", "death", "grieving", "mourning", "miss"],
        "growth": ["progress", "better", "healing", "learning", "change"],
        "coping": ["cope", "manage", "handle", "deal with", "strategy"]
    }
    
    # Check current message
    msg_lower = user_msg.lower()
    for theme, keywords in theme_keywords.items():
        if any(keyword in msg_lower for keyword in keywords):
            themes.append(theme)
    
    # Check memories for recurring themes
    if memories:
        memory_text = " ".join(memories).lower()
        for theme, keywords in theme_keywords.items():
            if any(keyword in memory_text for keyword in keywords):
                if theme not in themes:
                    themes.append(f"ongoing_{theme}")
    
    return themes

def build_personalized_system_prompt(user_id: str, current_msg: str, mode: str, themes: List[str]) -> str:
    """Build a system prompt that incorporates user's history and patterns"""
    base_prompt = get_mode_config(mode)["system_prompt"]
    
    # Add personalization based on themes
    personalization = ""
    if themes:
        if "anxiety" in themes or "ongoing_anxiety" in themes:
            personalization += "This person has shared about anxiety before. Be especially grounding and calm. "
        if "depression" in themes or "ongoing_depression" in themes:
            personalization += "This person has opened up about depression. Be warm and validating. "
        if "relationships" in themes:
            personalization += "Relationship concerns are important to this person. "
        if "work_stress" in themes:
            personalization += "Work stress is a recurring theme. "
        if any("ongoing_" in theme for theme in themes):
            personalization += "Remember this person's ongoing journey and acknowledge their progress. "
    
    enhanced_prompt = f"""
{base_prompt}

PERSONALIZATION CONTEXT: {personalization}

CONVERSATION GUIDELINES:
- Avoid repetitive phrases like "I'm here with you" - vary your responses naturally
- Reference relevant past conversations when appropriate to show continuity
- Build on previous sessions rather than starting fresh each time
- Use the person's communication style - formal vs casual, direct vs exploratory
- Show genuine curiosity about their specific situation
- Avoid generic therapeutic responses - be authentic and specific
- If they've shared progress before, acknowledge it
- If they've mentioned specific struggles, remember and check in appropriately

RESPONSE STYLE:
- Be conversational and natural, not clinical
- Vary your sentence structure and length
- Ask different types of questions - not always "How does that make you feel?"
- Use their own words and phrases when reflecting back
- Show emotional attunement through your word choice
- Balance support with gentle challenge when appropriate
"""
    
    return enhanced_prompt

# ────────────────────────────────────────────────────────────────────────────
# Enhanced response generation
def generate_contextual_response(user_msg: str, user_emotion: str, memories: List[str], 
                               themes: List[str], mode: str, recent_responses: List[str]) -> Tuple[str, str]:
    """Generate a response that considers context, emotion, and avoids repetition"""
    
    # Determine response approach based on emotion and themes
    if user_emotion in ["sad", "depressed", "hopeless"]:
        approach = "validating"
    elif user_emotion in ["anxious", "worried", "overwhelmed"]:
        approach = "supportive"
    elif user_emotion in ["excited", "happy", "content"]:
        approach = "encouraging"
    else:
        approach = "curious"
    
    # Get varied starter that hasn't been used recently
    recent_words = [word for response in recent_responses[-3:] for word in response.split()[:5]]
    starter = get_varied_response_start(approach, recent_words)
    
    # Build response strategy based on themes
    response_strategy = ""
    if "ongoing_anxiety" in themes:
        response_strategy = "Continue building on anxiety management strategies we've discussed. "
    elif "progress" in user_msg.lower() or "better" in user_msg.lower():
        response_strategy = "Acknowledge and celebrate progress while exploring what's working. "
    elif any(word in user_msg.lower() for word in ["stuck", "same", "again", "still"]):
        response_strategy = "Gently explore patterns and what might help create movement. "
    
    return starter, response_strategy

# ────────────────────────────────────────────────────────────────────────────
# SQLite Insights (keeping your existing code but enhanced)
@contextmanager
def get_insights_db():
    conn = sqlite3.connect('slurpy_insights.db')
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_insights_db():
    with get_insights_db() as conn:
        # Check if themes column exists, add if not
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(chat_messages)")
        columns = [column[1] for column in cursor.fetchall()]
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                message_count INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                dominant_emotion TEXT,
                themes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create messages table with all required columns
        conn.execute('''
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                emotion TEXT,
                intensity REAL,
                topics TEXT,
                themes TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                assistant_reaction TEXT,
                personalization_used TEXT,
                FOREIGN KEY (session_id) REFERENCES chat_sessions (session_id)
            )
        ''')
        
        # Add themes column if it doesn't exist
        if 'themes' not in columns:
            try:
                conn.execute('ALTER TABLE chat_messages ADD COLUMN themes TEXT')
                print("✅ Added themes column to chat_messages table")
            except Exception as e:
                print(f"⚠️ Could not add themes column: {e}")
        
        # Add personalization_used column if it doesn't exist
        if 'personalization_used' not in columns:
            try:
                conn.execute('ALTER TABLE chat_messages ADD COLUMN personalization_used TEXT')
                print("✅ Added personalization_used column to chat_messages table")
            except Exception as e:
                print(f"⚠️ Could not add personalization_used column: {e}")
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS journal_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                title TEXT,
                content TEXT NOT NULL,
                emotion TEXT,
                intensity REAL,
                topics TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS calendar_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                event_date DATETIME NOT NULL,
                emotion TEXT,
                topics TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

def store_chat_session_analytics(session_id: str, user_id: str):
    with get_insights_db() as conn:
        conn.execute(
            'INSERT OR IGNORE INTO chat_sessions (session_id, user_id, start_time) VALUES (?, ?, ?)',
            (session_id, user_id, datetime.datetime.now())
        )
        conn.commit()

def store_enhanced_analytics(session_id: str, user_id: str, user_msg: str, 
                           assistant_response: str, emotion: str, intensity: float, themes: List[str]):
    """Store analytics with enhanced theme tracking"""
    with get_insights_db() as conn:
        themes_json = json.dumps(themes) if themes else None
        conn.execute(
            '''INSERT INTO chat_messages 
               (session_id, user_id, role, content, emotion, intensity, themes, assistant_reaction)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (session_id, user_id, "user", user_msg, emotion, intensity, themes_json, "")
        )
        conn.execute(
            '''INSERT INTO chat_messages 
               (session_id, user_id, role, content, emotion, intensity, themes, assistant_reaction)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (session_id, user_id, "assistant", assistant_response, "supportive", 0.8, themes_json, emotion)
        )
        conn.commit()

def sync_to_nextjs_api(user_id: str, session_id: str, message: str, role: str,
                       emotion: Optional[str], intensity: Optional[float], topics: List[str]):
    """Best‑effort sync to Next.js /api/insights; ignore failures so chat UX never breaks."""
    try:
        api_url = os.getenv("INSIGHTS_API_URL", "http://localhost:3000/api/insights")
        payload = {
            "sessionId": session_id,
            "message": message,
            "role": role,
            "emotion": emotion,
            "intensity": intensity,
            "topics": topics
        }
        requests.post(api_url, json=payload, timeout=5)
    except Exception:
        pass

# ────────────────────────────────────────────────────────────────────────────
# Load environment and initialize
load_dotenv()

LOG_PATH = pathlib.Path("sessions.jsonl")
History = Deque[Tuple[str, str, str]]

# Personality modes
PERSONALITY_MODES: Dict[str, Dict[str, str]] = {
    "therapist": {
        "emoji": "🧘",
        "name": "Therapist",
        "description": "skilled listener who follows client's lead",
        "system_prompt": (
            "You are Slurpy in Therapist mode. Listen deeply and respond with genuine empathy. "
            "Build on what the person shares rather than redirecting. Use reflective listening "
            "and ask thoughtful questions that help them explore their feelings. Be present and authentic."
        ),
        "tone_style": "Gentle, validating, present."
    },
    "friend": {
        "emoji": "🧑‍🤝‍🧑", 
        "name": "Friend",
        "description": "casual, relatable, supportive",
        "system_prompt": (
            "You are Slurpy in Friend mode. Be warm, genuine, and relatable like a close friend. "
            "Share in their emotions, offer support naturally, and be conversational rather than clinical. "
            "Remember what they've told you and show you care about their ongoing situation."
        ),
        "tone_style": "Casual, warm, genuinely caring."
    },
    "coach": {
        "emoji": "🥊",
        "name": "Coach",
        "description": "hype, tough love, progress-driven",
        "system_prompt": (
            "You are Slurpy in Coach mode. Be energetic and progress-driven. Focus on solutions "
            "and actionable steps. Offer encouragement and accountability while being supportive."
        ),
        "tone_style": "Energetic, direct, encouraging."
    }
}
DEFAULT_MODE = "friend"

def get_available_modes() -> List[Dict[str, str]]:
    """Get list of available personality modes"""
    return [
        {"id": m_id, "emoji": cfg["emoji"], "name": cfg["name"], "description": cfg["description"]}
        for m_id, cfg in PERSONALITY_MODES.items()
    ]

def get_mode_config(mode: str) -> Dict[str, str]:
    return PERSONALITY_MODES.get(mode, PERSONALITY_MODES[DEFAULT_MODE])

# Emotion detection
def emotion_intensity(text: str) -> Tuple[str, float]:
    inputs = _emo_tok(text, return_tensors="pt", truncation=True)
    probs = torch.softmax(_emo_model(**inputs).logits, dim=1)[0]
    idx = int(torch.argmax(probs))
    label = _emo_model.config.id2label[idx]
    return label, float(probs[idx])

def fruit_for(emotion: str) -> str:
    fruits = {
        "joy": "Sunny Mango", "frustrated": "Tart Lemon", "excited": "Fizzy Orange",
        "anxious": "Jittery Banana", "angry": "Spicy Chili", "calm": "Cool Melon",
        "sad": "Gentle Blueberry", "hopeful": "Sweet Grape", "content": "Warm Peach",
        "worried": "Sour Apple", "thoughtful": "Deep Plum", "proud": "Golden Apricot",
        "neutral": "Fresh Cucumber"
    }
    return fruits.get(emotion, "Fresh Cucumber")

def extract_topics_from_message(message: str) -> List[str]:
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
        "crisis": ["crisis", "emergency", "help", "urgent", "serious"],
        "memory": ["remember", "recall", "story", "told you", "shared", "reshare"],
        "journal": ["journal", "diary", "write", "writing", "reflection"],
        "calendar": ["calendar", "schedule", "appointment", "meeting", "event"],
        "planning": ["plan", "organize", "schedule", "agenda", "todo"],
        "humor": ["haha", "lol", "lmao", "funny", "hilarious", "joke"]
    }
    message_lower = message.lower()
    detected = []
    for topic, kws in topic_keywords.items():
        if any(k in message_lower for k in kws):
            detected.append(topic)
    return detected

# Safety functions
def is_self_harm(txt: str) -> bool:
    txt = txt.lower()
    return any(k in txt for k in ("kill myself", "suicide", "end it", "end my life", "hurt myself"))

def handle_crisis_with_context(msg: str, mode: str, memories: List[str]) -> str:
    """Handle crisis with personalized context"""
    base_crisis = "I'm really concerned about you right now. Please reach out for immediate help: call 988 (US) or your local crisis hotline."
    
    if memories and any("therapy" in mem.lower() or "counselor" in mem.lower() for mem in memories):
        return f"{base_crisis} Since you've mentioned working with a therapist before, please also reach out to them if possible."
    
    return base_crisis

def format_history(hist: History) -> str:
    if not hist:
        return "This is the beginning of your conversation."
    
    formatted = []
    for user_msg, assistant_msg, emotion in list(hist)[-5:]:  # Last 5 exchanges
        formatted.append(f"User: {user_msg}")
        formatted.append(f"Slurpy: {assistant_msg}")
    
    return "\n".join(formatted)

def is_greeting(txt: str) -> bool:
    greetings = {"hi", "hey", "yo", "hello", "good morning", "good afternoon", "good evening", "sup", "what's up"}
    return any(txt.lower().strip().startswith(g) for g in greetings)

def clean_response(response: str, recent_responses: List[str]) -> str:
    """Clean up response to be more natural and avoid repetition"""
    
    # Remove common AI artifacts
    response = re.sub(r'^(As an AI|I understand that|I hear you|I can see)', '', response, flags=re.IGNORECASE)
    response = response.strip()
    
    # Check for repetitive patterns
    if recent_responses:
        # If response is too similar to recent ones, add variation
        for recent in recent_responses[-2:]:
            if len(response) > 30 and len(recent) > 30 and response.lower()[:30] == recent.lower()[:30]:
                variations = [
                    "You know, ",
                    "I'm thinking ",
                    "It sounds like ",
                    "What I'm hearing is ",
                    "From what you're sharing, "
                ]
                response = random.choice(variations) + response.lower()
                break
    
    return response

# Initialize LLM
llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    temperature=0.7,
    model_kwargs={"max_tokens": 400},
)

# Enhanced main response function
def slurpy_answer(msg: str,
                  hist: History,
                  user_id: Optional[str] = None,
                  mode: str = DEFAULT_MODE,
                  session_id: Optional[str] = None) -> Tuple[str, str, str]:
    """
    Generate Slurpy's answer with enhanced personalization and natural responses.
    Returns: (assistant_text, user_emotion, fruit_label)
    """
    if user_id is None:
        user_id = "anonymous"
    if session_id is None:
        session_id = str(uuid.uuid4())

    # Ensure analytics session row exists
    store_chat_session_analytics(session_id, user_id)

    # Get user's emotion
    user_em, user_prob = emotion_intensity(msg)
    
    # Get personalized context from memory
    memories = recall(user_id, msg, k=5)
    personalized_context = get_personalized_context(user_id, msg)
    
    # Extract themes from current message and history
    themes = extract_conversation_themes(msg, memories)
    
    # Build recent responses to avoid repetition
    recent_responses = [response for _, response, _ in list(hist)[-3:]]
    
    # Crisis handling
    if is_self_harm(msg):
        crisis_response = handle_crisis_with_context(msg, mode, memories)
        hist.append((msg, crisis_response, user_em))
        topics = extract_topics_from_message(msg)
        store_enhanced_analytics(session_id, user_id, msg, crisis_response, user_em, user_prob, themes)
        add_message(user_id, msg, user_em, fruit_for(user_em), user_prob)
        sync_to_nextjs_api(user_id, session_id, msg, "user", user_em, user_prob, topics)
        return crisis_response, user_em, fruit_for(user_em)
    
    # Handle greetings more naturally
    if is_greeting(msg) and len(hist) == 0:
        # First greeting - be welcoming
        greeting_responses = [
            "Hey there! I'm really glad you're here. What's on your mind today?",
            "Hi! Good to see you. How are you doing?", 
            "Hello! Thanks for stopping by. What would you like to talk about?",
            "Hey! I'm here and ready to listen. What's going on?"
        ]
        greeting = random.choice(greeting_responses)
        hist.append((msg, greeting, user_em))
        topics = extract_topics_from_message(msg)
        store_enhanced_analytics(session_id, user_id, msg, greeting, user_em, user_prob, themes)
        add_message(user_id, msg, user_em, fruit_for(user_em), user_prob)
        sync_to_nextjs_api(user_id, session_id, msg, "user", user_em, user_prob, topics)
        return greeting, user_em, fruit_for(user_em)
    
    elif is_greeting(msg) and memories:
        # Returning user - show continuity
        greeting = "Good to see you again! Last time we talked about some important things. How have you been?"
        hist.append((msg, greeting, user_em))
        topics = extract_topics_from_message(msg)
        store_enhanced_analytics(session_id, user_id, msg, greeting, user_em, user_prob, themes)
        add_message(user_id, msg, user_em, fruit_for(user_em), user_prob)
        sync_to_nextjs_api(user_id, session_id, msg, "user", user_em, user_prob, topics)
        return greeting, user_em, fruit_for(user_em)
    
    # Generate contextual response
    starter, strategy = generate_contextual_response(msg, user_em, memories, themes, mode, recent_responses)
    
    # Build enhanced system prompt
    system_prompt = build_personalized_system_prompt(user_id, msg, mode, themes)
    
    # Create the full prompt with context
    context_section = ""
    if personalized_context:
        context_section = f"PERSONAL CONTEXT:\n{personalized_context}\n\n"
    
    if themes:
        context_section += f"CONVERSATION THEMES: {', '.join(themes)}\n\n"
    
    full_prompt = f"""
{system_prompt}

{context_section}CONVERSATION HISTORY:
{format_history(hist)}

CURRENT MESSAGE: {msg}
USER EMOTION: {user_em} (intensity: {user_prob:.2f})

RESPONSE GUIDANCE: {strategy}

Respond naturally and specifically to what they've shared. Avoid repetitive phrases. 
Show that you remember and care about their ongoing situation. Be genuinely helpful.
"""

    # Generate response using LLM
    try:
        response = str(llm.invoke(full_prompt).content).strip()
        
        # Clean up common AI artifacts
        response = clean_response(response, recent_responses)
        
        # Store in history and memory
        hist.append((msg, response, user_em))
        if len(hist) > 10:  # Keep more history for better context
            hist.popleft()
        
        # Add to memory with themes
        add_message(user_id, msg, user_em, fruit_for(user_em), user_prob)
        
        # Store analytics with themes
        topics = extract_topics_from_message(msg)
        store_enhanced_analytics(session_id, user_id, msg, response, user_em, user_prob, themes)
        sync_to_nextjs_api(user_id, session_id, msg, "user", user_em, user_prob, topics)
        sync_to_nextjs_api(user_id, session_id, response, "assistant", "supportive", 0.8, themes)
        
        return response, user_em, fruit_for(user_em)
        
    except Exception as e:
        # Fallback response
        print(f"⚠️ LLM Error: {e}")
        fallback = f"I'm having a moment of technical difficulty, but I'm still here with you. {starter}"
        hist.append((msg, fallback, user_em))
        topics = extract_topics_from_message(msg)
        store_enhanced_analytics(session_id, user_id, msg, fallback, user_em, user_prob, themes)
        add_message(user_id, msg, user_em, fruit_for(user_em), user_prob)
        sync_to_nextjs_api(user_id, session_id, msg, "user", user_em, user_prob, topics)
        return fallback, user_em, fruit_for(user_em)

# Journal & Calendar helpers (keeping your existing functions)
def add_journal_entry(user_id: str, title: str, content: str):
    user_em, intensity = emotion_intensity(content)
    topics = extract_topics_from_message(content)
    # Store journal analytics...
    add_message(user_id, f"Journal entry: {title}\n{content}", user_em, fruit_for(user_em), intensity)
    print(f"📔 Journal entry added: {user_em} ({intensity:.2f}) - Topics: {topics}")

def add_calendar_event(user_id: str, title: str, description: str, event_date: datetime.datetime):
    full_text = f"{title} {description}"
    user_em = "neutral"
    topics = extract_topics_from_message(full_text)
    # Store calendar analytics...
    add_message(user_id, f"Calendar event: {title}\n{description}", user_em, fruit_for(user_em), 0.5)
    print(f"📅 Calendar event added: {title} - Topics: {topics}")

# Initialize the database
init_insights_db()

# CLI runner for testing
if __name__ == "__main__":
    mem: History = deque()
    current_mode = DEFAULT_MODE
    current_session_id = str(uuid.uuid4())

    print(f"🎭 Modes:")
    for mode_id, cfg in PERSONALITY_MODES.items():
        print(f"  {cfg['emoji']} {cfg['name']}: {cfg['description']}")
    print(f"\n🎯 Starting in {PERSONALITY_MODES[current_mode]['name']} mode")
    print(f"📊 Session ID: {current_session_id}")
    print("💡 'mode [name]' to switch | 'journal [title]: [content]' | 'event [title]: [desc]'")

    while True:
        try:
            user_input = input(f"\n[{PERSONALITY_MODES[current_mode]['emoji']} {PERSONALITY_MODES[current_mode]['name']}] You > ").strip()

            if user_input.lower().startswith("mode "):
                requested_mode = user_input.lower().replace("mode ", "", 1).strip()
                if requested_mode in PERSONALITY_MODES:
                    current_mode = requested_mode
                    cfg = PERSONALITY_MODES[current_mode]
                    print(f"\n🎭 Switched to {cfg['emoji']} {cfg['name']} mode")
                else:
                    print(f"❌ Unknown mode. Available: {', '.join(PERSONALITY_MODES.keys())}")
                continue

            if user_input.lower().startswith("journal "):
                journal_content = user_input[8:]
                if ":" in journal_content:
                    title, content = journal_content.split(":", 1)
                    add_journal_entry("anonymous", title.strip(), content.strip())
                else:
                    add_journal_entry("anonymous", "Journal Entry", journal_content)
                continue

            if user_input.lower().startswith("event "):
                event_content = user_input[6:]
                if ":" in event_content:
                    title, description = event_content.split(":", 1)
                    add_calendar_event("anonymous", title.strip(), description.strip(), datetime.datetime.now())
                else:
                    add_calendar_event("anonymous", event_content, "", datetime.datetime.now())
                continue

            if user_input.lower() in ["quit", "exit", "bye"]:
                break

            reply, emo, fruit = slurpy_answer(
                user_input, mem, user_id="anonymous", mode=current_mode, session_id=current_session_id
            )
            print(f"\nSlurpy ({fruit} – {emo} – {PERSONALITY_MODES[current_mode]['name']}): {reply}\n")

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"⚠️ Error: {e}")

    print(f"\n🌙 Session {current_session_id} completed. Take care.\n")