# backend/rag_core.py
import os, uuid, re
from collections import deque
from typing import Deque, Tuple, List, Optional, Dict, Any

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from emotion.predict import _model as _emo_model, _tok as _emo_tok
from .modes import available as modes_available, config as mode_config, DEFAULT_MODE
from .analytics import init as init_db, upsert_session, add_msg, set_session_fields
from .safety import classify as safety_classify, crisis_message
from .ufm import update as ufm_update
from .plans import vote as plans_vote, roadmap as plans_roadmap
from .roleplay import PERSONAS, record as rp_record
from .memory import add_message as kv_add, recall  # package-relative import

History = Deque[Tuple[str, str, str]]

# initialize analytics backing store (no-op if already set up)
init_db()
os.environ["TOKENIZERS_PARALLELISM"] = "false"

LLM = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    temperature=float(os.getenv("OPENAI_TEMPERATURE", "0.7")),
    model_kwargs={"max_tokens": 450},  # set via model_kwargs for compatibility with this LC version
)

ANX = {"panic","panicked","panicking","anxious","nervous","worried","overwhelmed","fear","dread","on edge","edgy"}
ANG = {"angry","mad","furious","irritated","frustrated","resentful"}
SAD = {"sad","down","depressed","empty","tired","numb","lonely"}
FRUITS = {"anxious":"Jittery Banana","angry":"Spicy Chili","sad":"Gentle Blueberry","calm":"Cool Melon","happy":"Sunny Mango","neutral":"Fresh Cucumber"}

def _norm(lbl: str):
    l = (lbl or "neutral").lower()
    if l in {"panic","panicked","panicking"}: return "anxious"
    if l in {"irritated"}: return "angry"
    if l in {"tired","numb"}: return "sad"
    return l

def emotion_intensity(text: str) -> Tuple[str, float]:
    import torch
    inputs = _emo_tok(text, return_tensors="pt", truncation=True)
    probs = torch.softmax(_emo_model(**inputs).logits, dim=1)[0]
    idx = int(probs.argmax()); label = _norm(_emo_model.config.id2label[int(idx)])
    return label, float(probs[idx])

def fruit_for(em: str):
    return FRUITS.get(em, "Fresh Cucumber")

def _guess_emotion(txt: str) -> Optional[str]:
    t = txt.lower()
    if any(w in t for w in ANX): return "anxious"
    if any(w in t for w in ANG): return "angry"
    if any(w in t for w in SAD): return "sad"
    if "calm" in t: return "calm"
    if "happy" in t or "glad" in t: return "happy"
    return None

def _themes(msg: str, memories: List[str]) -> List[str]:
    t = msg.lower(); out = []
    K = {
      "anxiety":["anxious","panic","fear","worry","overwhelm"],
      "depression":["depressed","sad","empty","hopeless","numb"],
      "anger":["angry","furious","irritated","resent"],
      "relationships":["partner","relationship","family","parent","friend","breakup"],
      "work_stress":["work","job","boss","deadline","career"],
      "self_esteem":["confidence","worth","insecure"],
      "trauma":["trauma","ptsd","flashback","trigger"],
      "grief":["loss","death","grieve","miss"],
    }
    for k, kws in K.items():
        if any(kw in t for kw in kws): out.append(k)
    if memories:
        mem = " ".join(memories).lower()
        for k, kws in K.items():
            if any(kw in mem for kw in kws) and k not in out: out.append("ongoing_"+k)
    return out

def _history_str(hist: History):
    if not hist: return "(start)"
    L = []
    for u,a,_ in list(hist)[-6:]:
        L.append(f"User: {u}\nSlurpy: {a}")
    return "\n".join(L)

# ---------- response cleaner ----------
# - strip "Slurpy:" prefix if model hallucinates it
# - remove boilerplate like "That sounds heavy. I'm here with you." at the start
# - drop any hallucinated "— Care Kit —" block entirely
_HEAVY_RX = re.compile(
    r"^\s*(that\s+sounds\s+heavy\.?\s*i[’']?m\s+here\s+with\s+you\.?)\s*",
    re.IGNORECASE,
)
def _clean(resp: str):
    if not isinstance(resp, str): return ""
    r = resp.strip()

    # remove leading "Slurpy:" if present
    r = re.sub(r"^\s*slurpy\s*:\s*", "", r, flags=re.I)

    # remove boilerplate "That sounds heavy..." if it sneaks in
    r = _HEAVY_RX.sub("", r)

    # remove "As an AI..." style openers
    r = re.sub(r"^(as an ai|i (can|understand|see))[:,]?\s*", "", r, flags=re.I).strip()

    # strip any hallucinated Care Kit block (we don't render Care Kit anymore)
    ck = re.search(r"^\s*—\s*Care\s*Kit\s*—.*$", r, flags=re.I | re.M | re.S)
    if ck:
        r = r[:ck.start()].rstrip()

    return r

def get_available_modes():
    return modes_available()

# ---------- intent detection for guidance/insight requests ----------
_GUIDE_PATTERNS = [
    r"\bwhy\s+am\s+i\b", r"\bwhy\s+do\s+i\b", r"\bhelp me (understand|figure|make sense)",
    r"\bguide me\b", r"\bwalk me through\b", r"\bcan you (explain|walk me through|guide me)\b",
    r"\bwhat(?:'s| is)\s+going on with me\b", r"\bwhy do i feel\b", r"\bhow do i deal\b",
    r"\bhow can i (cope|handle|work with)\b"
]
_GUIDE_RX = re.compile("|".join(_GUIDE_PATTERNS), re.IGNORECASE)

def _is_guidance_seek(msg: str) -> bool:
    return bool(_GUIDE_RX.search(msg or ""))

def build_stream_prompt(msg: str, hist: History, user_id: Optional[str] = None, mode: str = DEFAULT_MODE) -> Dict[str,Any]:
    user_id = user_id or "anonymous"
    label, prob = emotion_intensity(msg)
    guess = _guess_emotion(msg) or label
    mems = recall(user_id, msg, k=5)
    th = _themes(msg, mems)
    sys = mode_config(mode)["system_prompt"]

    style_rules = (
        "Write like a present, caring human. Use specific validations. Plain language. "
        "Short paragraphs. Avoid generic disclaimers. Use 'we' and 'you' when helpful."
    )

    ctx = []
    if mems: ctx.append("Relevant memories:\n- " + "\n- ".join(mems[:3]))
    if th: ctx.append("Themes: " + ", ".join(th))
    ctx_block = ("\n\n".join(ctx)) if ctx else ''
    mode_block = f"Mode: {mode}\nStyle rules: {style_rules}"

    if _is_guidance_seek(msg):
        guidance = (
            "User is asking for guidance/meaning-making. Do NOT reply with a question first. "
            "Respond with (1) a brief, concrete validation; (2) 2–3 plausible explanations or frames "
            "rooted in evidence-based therapy; (3) an optional tiny step we could try now; "
            "then (4) end with one gentle invite to expand (e.g., 'does any of that land?' or "
            "'want to unpack the second piece together?'). Keep it collaborative and two-sided."
        )
    else:
        guidance = "Be concise and grounded. Validate specifically. Offer a single thoughtful question at most."

    full = f"""
{sys}

{mode_block}

{ctx_block}
Conversation:
{_history_str(hist)}

Message: {msg}
Emotion: {guess} ({prob:.2f})
Guidance: {guidance}
""".strip()
    return {"full_prompt": full, "user_emotion": guess, "intensity": prob, "fruit": fruit_for(guess), "themes": th}

def _safe_plan_ctx(road: Dict[str, Any]) -> str:
    if not isinstance(road, dict):
        return "Plan: forming"
    approach = road.get("approach") or "forming"
    phase = road.get("phase") or "init"
    steps = road.get("steps") or []
    if not isinstance(steps, list):
        steps = []
    steps_txt = ", ".join([str(s) for s in steps[:2]]) if steps else "—"
    return f"Plan: {approach} | Phase: {phase} | Steps: {steps_txt}"

def slurpy_answer(
    msg: str,
    hist: History,
    user_id: Optional[str] = None,
    mode: str = DEFAULT_MODE,
    session_id: Optional[str] = None
) -> Optional[Tuple[str, str, str]]:
    user_id = user_id or "anonymous"
    session_id = session_id or str(uuid.uuid4())
    upsert_session(session_id, user_id)

    label, prob = emotion_intensity(msg)
    guess = _guess_emotion(msg) or label
    mems = recall(user_id, msg, k=5)

    # Crisis routing
    level, _ = safety_classify(msg)
    if level:
        text = crisis_message(mems)
        hist.append((msg, text, guess))
        add_msg(session_id, user_id, "user", msg, guess, prob, _themes(msg, mems))
        add_msg(session_id, user_id, "assistant", text, "crisis", 1.0, ["crisis"])
        kv_add(user_id, msg, guess, fruit_for(guess), prob)
        # Roleplay record both sides if in persona mode
        if mode in PERSONAS:
            turn = len(hist)
            rp_record(session_id, mode, "user", msg, turn)
            rp_record(session_id, mode, "assistant", text, turn + 1)
        return text, guess, fruit_for(guess)

    th = _themes(msg, mems)
    ufm_update(user_id, msg, guess, th)
    plan = plans_vote(user_id, th) or {}
    road = plans_roadmap(user_id) or {}

    # choose system prompt; swap if persona roleplay
    sys = mode_config(mode)["system_prompt"]
    roleplay = mode in PERSONAS
    if roleplay:
        sys = PERSONAS[mode]["system"]

    # shared style rules
    style_rules = (
        "Write like a present, caring human. Use specific validations. Plain language. "
        "Short paragraphs. Avoid generic disclaimers. Use 'we' and 'you' when helpful."
    )

    ctx_lines = []
    if mems: ctx_lines.append("Relevant memories:\n- " + "\n- ".join(mems[:3]))
    if th: ctx_lines.append("Themes: " + ", ".join(th))
    ctx_lines.append(_safe_plan_ctx(road))
    ctx_block = "\n\n".join(ctx_lines) if ctx_lines else ""

    if _is_guidance_seek(msg):
        guidance = (
            "User is asking for guidance/meaning-making. Do NOT start with a question. "
            "Respond with (1) brief, concrete validation; (2) 2–3 plausible explanations or frames "
            "rooted in evidence-based therapy; (3) optionally one tiny thing we could try now; "
            "then (4) end with a single gentle invite to expand (e.g., 'does any of that land?' "
            "or 'want to unpack the second piece together?')."
        )
    else:
        guidance = "Validate specifically, be concise, and ask at most one thoughtful question."

    # Build messages for LLM
    user_block = f"""\
Style rules: {style_rules}

{ctx_block}
Conversation:
{_history_str(hist)}

Message: {msg}
Emotion: {guess} ({prob:.2f})
Instruction: {guidance}"""
    messages = [SystemMessage(content=sys), HumanMessage(content=user_block)]

    try:
        out = str(LLM.invoke(messages).content).strip()
        out = _clean(out)
        if not out:
            out = "Got you. Want to pick one thread to start with?"
    except Exception:
        out = "Got you. Want to pick one thread to start with?"

    final = out  # no Care Kit

    # update rolling history
    hist.append((msg, final, guess))
    if len(hist) > 10:
        hist.popleft()

    # analytics + memory
    add_msg(session_id, user_id, "user", msg, guess, prob, th)
    add_msg(session_id, user_id, "assistant", final, "support", 0.8, th)
    kv_add(user_id, msg, guess, fruit_for(guess), prob)

    # record roleplay turn (record both user and assistant when in persona)
    if roleplay:
        turn = len(hist)
        rp_record(session_id, mode, "user", msg, turn - 1)       # previous append means user is turn-1
        rp_record(session_id, mode, "assistant", final, turn)

    set_session_fields(session_id, themes=th, locked_plan=plan.get("locked_plan"))
    return final, guess, fruit_for(guess)

if __name__ == "__main__":
    from collections import deque
    hist = deque(maxlen=6)
    msg = input("User> ")
    out = slurpy_answer(msg, hist, user_id="local_test", mode=DEFAULT_MODE)
    print("\nAssistant>", out)
