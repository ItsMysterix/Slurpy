# backend/slurpy/domain/rag/service.py
from __future__ import annotations

import os
import uuid
import re
import traceback
import asyncio
import inspect
from collections import deque
from typing import Deque, Tuple, List, Optional, Dict, Any, Callable, Awaitable, TypeVar, cast

# Model-based response generation (NOT OpenAI wrapper)
from slurpy.domain.responses.model_based_generator import ModelBasedResponseGenerator
from slurpy.domain.responses.ranker import ResponseRanker
from slurpy.domain.treatment.phase_detection import TreatmentPhaseDetector

# unified NLP façade (prod-ready) — replaces old emotion.predict import
from slurpy.domain.nlp.service import classify_emotion_bucket

# ── Intent + Severity (trained models) ─────────────────────────────────
# Graceful: if models aren't trained yet, fall back silently
_intent_available = False
_severity_available = False
try:
    from intent.predict import intent_with_confidence
    _intent_available = True
except Exception:
    print("⚠️ Intent model not loaded yet (training?). Using fallback.")
    def intent_with_confidence(text: str):  # type: ignore[misc]
        return "exploring_feelings", 0.0

try:
    from severity.predict import severity_level
    _severity_available = True
except Exception:
    print("⚠️ Severity model not loaded yet (training?). Using fallback.")
    def severity_level(text: str):  # type: ignore[misc]
        return "moderate", 0.5

# local deps (match your tree)
from modes import available as modes_available, config as mode_config, DEFAULT_MODE
from slurpy.domain.analytics.collectors import init as init_db, upsert_session, add_msg, set_session_fields
from slurpy.domain.analytics.interaction_logger import log_interaction
from slurpy.domain.safety.service import classify as safety_classify, crisis_message
from slurpy.ufm import update as ufm_update
from slurpy.domain.plans.service import vote as plans_vote, roadmap as plans_roadmap
from slurpy.domain.roleplay.service import PERSONAS, record as rp_record
from slurpy.domain.memory.service import add_message as kv_add, recall
from slurpy.domain.cel.service import maybe_build_context

# (optional) your ANN retriever facade; kept for /search endpoints
from . import retriever

History = Deque[Tuple[str, str, str]]
T = TypeVar("T")

# init analytics (best-effort)
try:
    init_db()
except Exception as e:
    print("⚠️ analytics init failed:", e)

os.environ["TOKENIZERS_PARALLELISM"] = "false"

# ─────────────────────────────────────────────────────────────────────────────
# Therapy Response Generator (using trained models)
_response_generator: Optional[ModelBasedResponseGenerator] = None
_phase_detector: Optional[TreatmentPhaseDetector] = None
_response_ranker: Optional[ResponseRanker] = None

def _get_response_generator() -> ModelBasedResponseGenerator:
    global _response_generator
    if _response_generator is None:
        _response_generator = ModelBasedResponseGenerator()
    return _response_generator

def _get_phase_detector() -> TreatmentPhaseDetector:
    global _phase_detector
    if _phase_detector is None:
        _phase_detector = TreatmentPhaseDetector()
    return _phase_detector

def _get_ranker() -> ResponseRanker:
    global _response_ranker
    if _response_ranker is None:
        _response_ranker = ResponseRanker()
    return _response_ranker

# ─────────────────────────────────────────────────────────────────────────────
# lexicons & helpers
ANX = {"panic", "panicked", "panicking", "anxious", "nervous", "worried", "overwhelmed", "fear", "dread", "on edge", "edgy"}
ANG = {"angry", "mad", "furious", "irritated", "frustrated", "resentful"}
SAD = {"sad", "down", "depressed", "empty", "tired", "numb", "lonely"}

FRUITS = {
    "anxious": "Jittery Banana",
    "angry": "Spicy Chili",
    "sad": "Gentle Blueberry",
    "calm": "Cool Melon",
    "happy": "Sunny Mango",
    "neutral": "Fresh Cucumber",
}

def fruit_for(em: str) -> str:
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

def _history_str(hist: History) -> str:
    if not hist: return "(start)"
    L = []
    for u, a, _ in list(hist)[-6:]:
        L.append(f"User: {u}\nSlurpy: {a}")
    return "\n".join(L)

_GREETING_RX = re.compile(r"^\s*(hi|hey|hello|yo|sup|good\s+(morning|afternoon|evening)|howdy)\b[!.]?$", re.IGNORECASE)
def _is_greeting(msg: str) -> bool:
    return bool(_GREETING_RX.search((msg or "").strip()))

def _summarize_memory_line(text: str, max_chars: int = 90) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if len(t) <= max_chars: return t
    return t[:max_chars].rsplit(" ", 1)[0] + "…"

def _memory_hint_block(msg: str, mems: List[str], hist: History) -> str:
    if not mems or not msg: return ""
    if len(hist) <= 1 and _is_greeting(msg): return ""
    th_msg = set(_themes(msg, []))
    th_mem_raw = set(_themes("", mems))
    def _base(t: str) -> str: return t[8:] if t.startswith("ongoing_") else t
    th_mem = {_base(t) for t in th_mem_raw}
    overlap = th_msg.intersection(th_mem)
    early_session = len(hist) <= 6
    if not overlap or not early_session: return ""
    hint_src = _summarize_memory_line(mems[0])
    return (
        "Memory hint policy: If (and only if) today's message overlaps a past theme, "
        f"you may *briefly* ask: “Last time you mentioned ‘{hint_src}’. Is that still on your mind?” "
        "If they say no, drop it and move on. Use at most one hint per session unless invited."
    )

_HEAVY_RX = re.compile(r"^\s*(that\s+sounds\s+heavy\.?\s*i[’']?m\s+here\s+with\s+you\.?)\s*", re.IGNORECASE)
def _clean(resp: str) -> str:
    if not isinstance(resp, str): return ""
    r = resp.strip()
    r = re.sub(r"^\s*slurpy\s*:\s*", "", r, flags=re.I)
    r = _HEAVY_RX.sub("", r)
    r = re.sub(r"^(as an ai|i (can|understand|see))[:,]?\s*", "", r, flags=re.I).strip()
    ck = re.search(r"^\s*—\s*Care\s*Kit\s*—.*$", r, flags=re.I | re.M | re.S)
    if ck: r = r[:ck.start()].rstrip()
    return r

def get_available_modes():
    return modes_available()

_GUIDE_PATTERNS = [
    r"\bwhy\s+am\s+i\b", r"\bwhy\s+do\s+i\b", r"\bhelp me (understand|figure|make sense)",
    r"\bguide me\b", r"\bwalk me through\b", r"\bcan you (explain|walk me through|guide me)\b",
    r"\bwhat(?:'s| is)\s+going on with me\b", r"\bwhy do i feel\b", r"\bhow do i deal\b",
    r"\bhow can i (cope|handle|work with)\b"
]
_GUIDE_RX = re.compile("|".join(_GUIDE_PATTERNS), re.IGNORECASE)
def _is_guidance_seek(msg: str) -> bool:
    return bool(_GUIDE_RX.search(msg or ""))

def _safe_call(fn: Callable[..., T], *a, **kw) -> Tuple[bool, Optional[T]]:
    try:
        return True, fn(*a, **kw)
    except Exception as e:
        print(f"⚠️ _safe_call caught: {e}\n{traceback.format_exc()}")
        return False, None

async def _safe_call_async(fn: Callable[..., T | Awaitable[T]], *a, **kw) -> Tuple[bool, Optional[T]]:
    try:
        if asyncio.iscoroutinefunction(fn):
            val = await cast(Awaitable[T], fn(*a, **kw))
        else:
            loop = asyncio.get_running_loop()
            val = await loop.run_in_executor(None, lambda: fn(*a, **kw))
        if inspect.isawaitable(val):
            val = await cast(Awaitable[T], val)
        return True, cast(T, val)
    except Exception as e:
        print(f"⚠️ _safe_call_async caught: {e}\n{traceback.format_exc()}")
        return False, None

# ─────────────────────────────────────────────────────────────────────────────
# Emotion shim (keeps (label, prob) contract intact)
def emotion_intensity(text: str) -> Tuple[str, float]:
    """
    Backward-compatible shim that uses the unified NLP classifier.
    Returns: (bucket, confidence)
    """
    try:
        bucket, conf, _raw = classify_emotion_bucket(text)
        return bucket, conf
    except Exception as e:
        print("⚠️ emotion_intensity fallback:", e)
        guess = _guess_emotion(text) or "neutral"
        return guess, 0.5 if guess != "neutral" else 0.0

# ─────────────────────────────────────────────────────────────────────────────
# Public: build_stream_prompt (unchanged API)
def build_stream_prompt(msg: str, hist: History, user_id: Optional[str] = None, mode: str = DEFAULT_MODE) -> Dict[str, Any]:
    user_id = user_id or "anonymous"
    label, prob = emotion_intensity(msg)
    guess = _guess_emotion(msg) or label
    ok_m, mems = _safe_call(recall, user_id, msg, 5); mems = mems or []
    th = _themes(msg, mems)
    sys = mode_config(mode)["system_prompt"]
    memory_hint = _memory_hint_block(msg, mems, hist)
    style_rules = (
        "Write like a present, caring human. Use specific validations. Plain language. "
        "Short paragraphs. Avoid generic disclaimers. Use 'we' and 'you' when helpful. "
        "Memory policy: never assume continuity. Only *ask permission* to revisit a past topic if today’s message overlaps."
    )
    ctx = []
    if mems: ctx.append("Relevant memories:\n- " + "\n- ".join(mems[:3]))
    if th: ctx.append("Themes: " + ", ".join(th))
    if memory_hint: ctx.append(memory_hint)
    ctx_block = ("\n\n".join(ctx)) if ctx else ''
    mode_block = f"Mode: {mode}\nStyle rules: {style_rules}"
    guidance = (
        "User is asking for guidance/meaning-making. Do NOT reply with a question first. "
        "Respond with (1) a brief, concrete validation; (2) 2–3 plausible explanations or frames "
        "rooted in evidence-based therapy; (3) an optional tiny step we could try now; "
        "then (4) end with one gentle invite to expand."
    ) if _is_guidance_seek(msg) else "Be concise and grounded. Validate specifically. Offer a single thoughtful question at most."
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
    if not isinstance(road, dict): return "Plan: forming"
    approach = road.get("approach") or "forming"
    phase = road.get("phase") or "init"
    steps = road.get("steps") or []
    if not isinstance(steps, list): steps = []
    steps_txt = ", ".join([str(s) for s in steps[:2]]) if steps else "—"
    return f"Plan: {approach} | Phase: {phase} | Steps: {steps_txt}"

# ─────────────────────────────────────────────────────────────────────────────
# Core reply (sync)
def slurpy_answer(
    msg: str,
    hist: History,
    user_id: Optional[str] = None,
    mode: str = DEFAULT_MODE,
    session_id: Optional[str] = None
) -> Optional[Tuple[str, str, str]]:
    user_id = user_id or "anonymous"
    session_id = session_id or str(uuid.uuid4())

    _safe_call(upsert_session, session_id, user_id)

    label, prob = emotion_intensity(msg)
    guess = _guess_emotion(msg) or label

    ok_m, mems = _safe_call(recall, user_id, msg, 5); mems = mems or []

    try:
        level_out = safety_classify(msg)
        level = level_out[0] if isinstance(level_out, (list, tuple)) and level_out else level_out
    except Exception as e:
        print("⚠️ safety_classify failed:", e)
        level = None

    if level:
        try:
            text = crisis_message(mems)
        except Exception:
            text = "I’m concerned about your safety. Please reach out now: call or text 988 in the US, or contact your local emergency services."
        hist.append((msg, str(text), guess))
        _safe_call(add_msg, session_id, user_id, "user", msg, guess, prob, _themes(msg, mems))
        _safe_call(add_msg, session_id, user_id, "assistant", str(text), "crisis", 1.0, ["crisis"])
        _safe_call(kv_add, user_id, msg, guess, fruit_for(guess), prob, maybe_build_context(msg))
        if mode in PERSONAS:
            turn = len(hist)
            _safe_call(rp_record, session_id, mode, "user", msg, turn)
            _safe_call(rp_record, session_id, mode, "assistant", str(text), turn + 1)
        return str(text), guess, fruit_for(guess)

    th = _themes(msg, mems)

    _safe_call(ufm_update, user_id, msg, guess, th)
    ok_pv, plan = _safe_call(plans_vote, user_id, th); plan = plan or {}
    ok_pr, road = _safe_call(plans_roadmap, user_id); road = road or {}

    sys = mode_config(mode)["system_prompt"]
    roleplay = mode in PERSONAS
    if roleplay:
        sys = PERSONAS[mode]["system"]

    memory_hint = _memory_hint_block(msg, mems, hist)

    # ── Intent + Severity from trained models ────────────────────────
    try:
        user_intent, intent_conf = intent_with_confidence(msg)
    except Exception as e:
        print(f"⚠️ Intent prediction failed: {e}")
        user_intent, intent_conf = "exploring_feelings", 0.0

    try:
        sev_label, sev_score = severity_level(msg)
    except Exception as e:
        print(f"⚠️ Severity prediction failed: {e}")
        sev_label, sev_score = "moderate", 0.5

    # Detect treatment phase
    try:
        phase_detector = _get_phase_detector()
        session_count = len(hist) + 1
        phase = phase_detector.detect_phase_from_metrics(
            session_count=session_count,
            days_in_treatment=session_count * 2,
            phq9_baseline=None,
            phq9_current=None,
            gad7_baseline=None,
            gad7_current=None,
            skills_learned=[],
            engagement_sessions_per_week=3.0,
            homework_adherence_pct=None,
        )
    except Exception as e:
        print(f"⚠️ Phase detection failed: {e}")
        phase = "stabilization"

    # ── Generate multiple candidates & rank (NOT OpenAI) ────────────
    try:
        gen = _get_response_generator()
        candidates = []
        for _ in range(3):
            out, response_meta = gen.generate_response_sync(
                user_message=msg,
                user_id=user_id,
                emotion_bucket=guess,
                emotion_confidence=prob,
                phase=phase,
                conversation_history=hist,
                themes=th,
                intent=user_intent,
                severity=sev_score,
            )
            if out:
                candidates.append(out)

        if not candidates:
            out = "I hear you. Tell me more about what's going on?"
        elif len(candidates) == 1:
            out = candidates[0]
        else:
            ranker = _get_ranker()
            history_responses = [resp for _, resp, _ in list(hist)[-5:]]
            best, score = ranker.pick_best(
                user_message=msg,
                candidates=candidates,
                conversation_history=history_responses,
                emotion=guess,
                severity=sev_score,
            )
            out = best if best else candidates[0]
    except Exception as e:
        print(f"⚠️ Model-based response generation failed: {e}")
        import traceback
        traceback.print_exc()
        out = "I'm here with you. What's on your mind right now?"

    final = _clean(out)

    hist.append((msg, final, guess))
    if len(hist) > 10:
        hist.popleft()

    _safe_call(add_msg, session_id, user_id, "user", msg, guess, prob, th)
    _safe_call(add_msg, session_id, user_id, "assistant", final, "support", 0.8, th)
    _safe_call(kv_add, user_id, msg, guess, fruit_for(guess), prob, maybe_build_context(msg))

    # Log pipeline metadata for debugging/improvement
    print(f"🧠 Pipeline: emotion={guess}({prob:.2f}) intent={user_intent}({intent_conf:.2f}) severity={sev_label}({sev_score:.2f}) phase={phase}")

    # Log interaction for continuous improvement / retraining
    log_interaction(
        user_id=user_id,
        session_id=session_id,
        user_message=msg,
        response=final,
        emotion=guess,
        emotion_confidence=prob,
        intent=user_intent,
        intent_confidence=intent_conf,
        severity=sev_label,
        severity_score=sev_score,
        phase=phase,
        themes=th,
    )

    if roleplay:
        turn = len(hist)
        _safe_call(rp_record, session_id, mode, "user", msg, turn - 1)
        _safe_call(rp_record, session_id, mode, "assistant", final, turn)

    _safe_call(set_session_fields, session_id, themes=th, locked_plan=plan.get("locked_plan"))
    return final, guess, fruit_for(guess)

# ─────────────────────────────────────────────────────────────────────────────
# Core reply (async)
async def async_slurpy_answer(
    msg: str,
    hist: History,
    user_id: Optional[str] = None,
    mode: str = DEFAULT_MODE,
    session_id: Optional[str] = None
) -> Optional[Tuple[str, str, str]]:
    user_id = user_id or "anonymous"
    session_id = session_id or str(uuid.uuid4())

    await _safe_call_async(upsert_session, session_id, user_id)

    try:
        bucket, conf, _raw = await asyncio.to_thread(classify_emotion_bucket, msg)
        label, prob = bucket, conf
    except Exception:
        guess = _guess_emotion(msg) or "neutral"
        label, prob = guess, 0.5 if guess != "neutral" else 0.0

    guess = _guess_emotion(msg) or label

    ok_m, mems = await _safe_call_async(recall, user_id, msg, 5); mems = mems or []

    try:
        ok_sf, lvl = await _safe_call_async(safety_classify, msg)
        level = None
        if ok_sf:
            if isinstance(lvl, (list, tuple)) and lvl: level = lvl[0]
            else: level = lvl
    except Exception as e:
        print("⚠️ safety_classify failed:", e); level = None

    if level:
        ok_cm, text = await _safe_call_async(crisis_message, mems)
        if not ok_cm or not text:
            text = "I’m concerned about your safety. Please reach out now: call or text 988 in the US, or contact your local emergency services."
        hist.append((msg, str(text), guess))
        await _safe_call_async(add_msg, session_id, user_id, "user", msg, guess, prob, _themes(msg, mems))
        await _safe_call_async(add_msg, session_id, user_id, "assistant", str(text), "crisis", 1.0, ["crisis"])
        await _safe_call_async(kv_add, user_id, msg, guess, fruit_for(guess), prob, maybe_build_context(msg))
        if mode in PERSONAS:
            turn = len(hist)
            await _safe_call_async(rp_record, session_id, mode, "user", msg, turn)
            await _safe_call_async(rp_record, session_id, mode, "assistant", str(text), turn + 1)
        return str(text), guess, fruit_for(guess)

    th = _themes(msg, mems)

    await _safe_call_async(ufm_update, user_id, msg, guess, th)
    ok_pv, plan = await _safe_call_async(plans_vote, user_id, th); plan = plan or {}
    ok_pr, road = await _safe_call_async(plans_roadmap, user_id); road = road or {}

    sys = mode_config(mode)["system_prompt"]
    roleplay = mode in PERSONAS
    if roleplay:
        sys = PERSONAS[mode]["system"]

    memory_hint = _memory_hint_block(msg, mems, hist)


    # ── Intent + Severity from trained models ────────────────────
    try:
        user_intent, intent_conf = await asyncio.to_thread(intent_with_confidence, msg)
    except Exception as e:
        print(f"⚠️ Intent prediction failed: {e}")
        user_intent, intent_conf = "exploring_feelings", 0.0

    try:
        sev_label, sev_score = await asyncio.to_thread(severity_level, msg)
    except Exception as e:
        print(f"⚠️ Severity prediction failed: {e}")
        sev_label, sev_score = "moderate", 0.5

    # Detect treatment phase
    try:
        phase_detector = _get_phase_detector()
        session_count = len(hist) + 1
        phase = phase_detector.detect_phase_from_metrics(
            session_count=session_count,
            days_in_treatment=session_count * 2,
            phq9_baseline=None,
            phq9_current=None,
            gad7_baseline=None,
            gad7_current=None,
            skills_learned=[],
            engagement_sessions_per_week=3.0,
            homework_adherence_pct=None,
        )
    except Exception as e:
        print(f"⚠️ Phase detection failed: {e}")
        phase = "stabilization"

    # ── Generate multiple candidates & rank (NOT OpenAI) ────────────
    try:
        gen = _get_response_generator()
        candidates = []
        for _ in range(3):
            result = await asyncio.to_thread(
                gen.generate_response_sync,
                user_message=msg,
                user_id=user_id,
                emotion_bucket=guess,
                emotion_confidence=prob,
                phase=phase,
                conversation_history=hist,
                themes=th,
                intent=user_intent,
                severity=sev_score,
            )
            out_text, _ = result
            if out_text:
                candidates.append(out_text)

        if not candidates:
            out = "I hear you. Tell me more about what's going on?"
        elif len(candidates) == 1:
            out = candidates[0]
        else:
            ranker = _get_ranker()
            history_responses = [resp for _, resp, _ in list(hist)[-5:]]
            best, score = await asyncio.to_thread(
                ranker.pick_best,
                msg, candidates, history_responses, guess, sev_score,
            )
            out = best if best else candidates[0]

        out = _clean(out)
        if not out:
            out = "Got you. Want to pick one thread to start with?"
    except Exception as e:
        print("⚠️ Model-based async generation failed:", e)
        out = "Got you. Want to pick one thread to start with?"

    final = out

    hist.append((msg, final, guess))
    if len(hist) > 10:
        hist.popleft()

    await _safe_call_async(add_msg, session_id, user_id, "user", msg, guess, prob, th)
    await _safe_call_async(add_msg, session_id, user_id, "assistant", final, "support", 0.8, th)
    await _safe_call_async(kv_add, user_id, msg, guess, fruit_for(guess), prob, maybe_build_context(msg))

    # Log pipeline metadata
    print(f"🧠 Pipeline: emotion={guess}({prob:.2f}) intent={user_intent}({intent_conf:.2f}) severity={sev_label}({sev_score:.2f}) phase={phase}")

    # Log interaction for continuous improvement / retraining
    log_interaction(
        user_id=user_id,
        session_id=session_id,
        user_message=msg,
        response=final,
        emotion=guess,
        emotion_confidence=prob,
        intent=user_intent,
        intent_confidence=intent_conf,
        severity=sev_label,
        severity_score=sev_score,
        phase=phase,
        themes=th,
    )

    if roleplay:
        turn = len(hist)
        await _safe_call_async(rp_record, session_id, mode, "user", msg, turn - 1)
        await _safe_call_async(rp_record, session_id, mode, "assistant", final, turn)

    await _safe_call_async(set_session_fields, session_id, themes=th, locked_plan=plan.get("locked_plan"))
    return final, guess, fruit_for(guess)

# ─────────────────────────────────────────────────────────────────────────────
# Optional thin facade for ANN search (kept for /search)
def ann_search(q: str, *, top_k: Optional[int] = None, dataset_id: Optional[str] = None, collection: Optional[str] = None) -> Dict[str, Any]:
    try:
        return retriever.search(
            q,
            k=top_k,
            dataset_id=dataset_id,
            collection=collection or os.getenv("QDRANT_COLLECTION", "slurpy_chunks"),
        )
    except Exception as e:
        print(f"⚠️ RAG search failed: {e}")
        return {"hits": []}
