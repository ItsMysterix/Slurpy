# backend/rag_core.py
import os, uuid, re, traceback
from collections import deque
from typing import Deque, Tuple, List, Optional, Dict, Any

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

# Local modules
from emotion.predict import _model as _emo_model, _tok as _emo_tok
from .modes import available as modes_available, config as mode_config, DEFAULT_MODE
from .analytics import init as init_db, upsert_session, add_msg, set_session_fields
from .safety import classify as safety_classify, crisis_message
from .ufm import update as ufm_update
from .plans import vote as plans_vote, roadmap as plans_roadmap
from .roleplay import PERSONAS, record as rp_record
from .memory import add_message as kv_add, recall  # package-relative import

History = Deque[Tuple[str, str, str]]

# ─────────────────────────────────────────────────────────────────────────────
# Initialize analytics backing store (don’t crash if unavailable)
try:
    init_db()
except Exception as e:
    print("⚠️ analytics init failed:", e)

# Tokenizers parallelism
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# LLM client
LLM = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    temperature=float(os.getenv("OPENAI_TEMPERATURE", "0.7")),
    model_kwargs={"max_tokens": 450},
)

# ─────────────────────────────────────────────────────────────────────────────
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

def _safe_call(fn, *a, **kw):
    """Run a function, swallow exceptions, and return (ok, value)."""
    try:
        return True, fn(*a, **kw)
    except Exception as e:
        print(f"⚠️ {_safe_call.__name__} caught: {e}\n{traceback.format_exc()}")
        return False, None

def emotion_intensity(text: str) -> Tuple[str, float]:
    # Keep the original function (used elsewhere), but make it resilient here too.
    try:
        import torch
        inputs = _emo_tok(text, return_tensors="pt", truncation=True)
        probs = torch.softmax(_emo_model(**inputs).logits, dim=1)[0]
        idx = int(probs.argmax())
        label = _norm(_emo_model.config.id2label[int(idx)])
        return label, float(probs[idx])
    except Exception as e:
        print("⚠️ emotion_intensity fallback:", e)
        return "neutral", 0.0

def fruit_for(em: str):
    return FRUITS.get(em, "Fresh Cucumber")

def _guess_emotion(txt: str) -> Optional[str]:
    t = (txt or "").lower()
    if any(w in t for w in ANX): return "anxious"
    if any(w in t for w in ANG): return "angry"
    if any(w in t for w in SAD): return "sad"
    if "calm" in t: return "calm"
    if "happy" in t or "glad" in t: return "happy"
    return None

def _themes(msg: str, memories: List[str]) -> List[str]:
    t = (msg or "").lower(); out: List[str] = []
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
_HEAVY_RX = re.compile(
    r"^\s*(that\s+sounds\s+heavy\.?\s*i[’']?m\s+here\s+with\s+you\.?)\s*",
    re.IGNORECASE,
)
def _clean(resp: str):
    if not isinstance(resp, str): return ""
    r = resp.strip()
    r = re.sub(r"^\s*slurpy\s*:\s*", "", r, flags=re.I)                # strip hallucinated “Slurpy:”
    r = _HEAVY_RX.sub("", r)                                           # drop boilerplate
    r = re.sub(r"^(as an ai|i (can|understand|see))[:,]?\s*", "", r, flags=re.I).strip()
    ck = re.search(r"^\s*—\s*Care\s*Kit\s*—.*$", r, flags=re.I | re.M | re.S)
    if ck: r = r[:ck.start()].rstrip()
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
    ok_m, mems = _safe_call(recall, user_id, msg, 5)
    mems = mems or []
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
            "then (4) end with one gentle invite to expand."
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

    # Don’t fail the whole request if analytics store is down
    _safe_call(upsert_session, session_id, user_id)

    # Emotion model — guard it
    label, prob = emotion_intensity(msg)
    guess = _guess_emotion(msg) or label

    # Memory recall — guard it
    ok_m, mems = _safe_call(recall, user_id, msg, 5)
    mems = mems or []

    # Crisis routing — guard safety classifier
    try:
        level, _ = safety_classify(msg)
    except Exception as e:
        print("⚠️ safety_classify failed:", e)
        level = None

    if level:
        try:
            text = crisis_message(mems)
        except Exception:
            text = "I’m concerned about your safety. Please reach out now: call or text 988 in the US, or contact your local emergency services."
        hist.append((msg, text, guess))

        _safe_call(add_msg, session_id, user_id, "user", msg, guess, prob, _themes(msg, mems))
        _safe_call(add_msg, session_id, user_id, "assistant", text, "crisis", 1.0, ["crisis"])
        _safe_call(kv_add, user_id, msg, guess, fruit_for(guess), prob)

        # Roleplay record both sides if persona
        if mode in PERSONAS:
            turn = len(hist)
            _safe_call(rp_record, session_id, mode, "user", msg, turn)
            _safe_call(rp_record, session_id, mode, "assistant", text, turn + 1)

        return text, guess, fruit_for(guess)

    th = _themes(msg, mems)

    # Best effort updates; never break core reply
    _safe_call(ufm_update, user_id, msg, guess, th)
    ok_pv, plan = _safe_call(plans_vote, user_id, th); plan = plan or {}
    ok_pr, road = _safe_call(plans_roadmap, user_id); road = road or {}

    # choose system prompt; swap if persona roleplay
    sys = mode_config(mode)["system_prompt"]
    roleplay = mode in PERSONAS
    if roleplay:
        sys = PERSONAS[mode]["system"]

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
            "then (4) end with a single gentle invite to expand."
        )
    else:
        guidance = "Validate specifically, be concise, and ask at most one thoughtful question."

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
    except Exception as e:
        print("⚠️ LLM.invoke failed:", e)
        out = "Got you. Want to pick one thread to start with?"

    final = out

    # update rolling history
    hist.append((msg, final, guess))
    if len(hist) > 10:
        hist.popleft()

    # analytics + memory (best effort)
    _safe_call(add_msg, session_id, user_id, "user", msg, guess, prob, th)
    _safe_call(add_msg, session_id, user_id, "assistant", final, "support", 0.8, th)
    _safe_call(kv_add, user_id, msg, guess, fruit_for(guess), prob)

    # record roleplay turn (record both user and assistant when in persona)
    if roleplay:
        turn = len(hist)
        _safe_call(rp_record, session_id, mode, "user", msg, turn - 1)
        _safe_call(rp_record, session_id, mode, "assistant", final, turn)

    _safe_call(set_session_fields, session_id, themes=th, locked_plan=plan.get("locked_plan"))
    return final, guess, fruit_for(guess)

if __name__ == "__main__":
    hist = deque(maxlen=6)
    msg = input("User> ")
    out = slurpy_answer(msg, hist, user_id="local_test", mode=DEFAULT_MODE)
    print("\nAssistant>", out)
