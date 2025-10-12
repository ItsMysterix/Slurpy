# backend/tests/test_backend.py
from __future__ import annotations

import os
import sys
from collections import deque

# Ensure "backend" is importable when running from repo root
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(THIS_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

print("=== TESTING SLURPY BACKEND (new layout) ===")

# 0) Basic env sanity
print("\n0) Env sanity...")
print("OPENAI_API_KEY set? ", bool(os.getenv("OPENAI_API_KEY")))
print("QDRANT_URL: ", os.getenv("QDRANT_URL"))
print("SUPABASE_URL: ", os.getenv("SUPABASE_URL"))

# 1) Imports for new modules
print("\n1) Imports...")
try:
    from slurpy.domain.cel.service import make_patch, maybe_build_context
    from slurpy.domain.rag.service import RagService
    from slurpy.domain.rag.retriever import search as rag_search
    from slurpy.domain.memory.service import add_message as mem_add, recall as mem_recall
    from slurpy.domain.safety.service import classify as safety_classify, crisis_message
    from slurpy.domain.plans.service import vote as plans_vote, roadmap as plans_roadmap
    from slurpy.domain.nlp.service import analyze_text
    from slurpy.domain.reports.service import build as report_build
    from slurpy.domain.roleplay.service import record as rp_record, PERSONAS
    from slurpy.domain.analytics.collectors import upsert_session, add_msg, set_session_fields
    print("✅ domain imports OK")
except Exception as e:
    print(f"❌ domain imports failed: {e}")
    sys.exit(1)

# 2) CEL patch (no network)
print("\n2) CEL patch...")
try:
    patch = make_patch("anxious", 0.8, "therapist", text="I'm spiraling before my exam.")
    print("✅ make_patch:", patch)
    ctx = maybe_build_context("Short demo text about work stress and a tight deadline.")
    print("ℹ️ compact context keys:", list(ctx.keys()) if ctx else ctx)
except Exception as e:
    print(f"❌ CEL failed: {e}")

# 3) Safety classifier (no network)
print("\n3) Safety...")
try:
    lvl, details = safety_classify("I can't cope and I'm thinking about pills tonight.")
    print("✅ classify:", lvl, details)
    if lvl:
        print("ℹ️ crisis_message:", crisis_message(["therapist mentioned once"], region="US"))
except Exception as e:
    print(f"❌ safety failed: {e}")

# 4) Analytics minimal (best-effort; tolerates missing schema)
print("\n4) Analytics (best-effort)...")
try:
    sid = "test_session"
    uid = "test_user"
    upsert_session(sid, uid)
    add_msg(sid, uid, "user", "hello", "neutral", 0.1, [])
    set_session_fields(sid, last_emotion="neutral")
    print("✅ analytics calls returned without crashing")
except Exception as e:
    print(f"⚠️ analytics write issues (tolerated): {e}")

# 5) Plans (no strict schema required; best-effort upserts)
print("\n5) Plans...")
try:
    st = plans_vote("test_user", ["anxiety", "work_stress"])
    rd = plans_roadmap("test_user")
    print("✅ vote:", st)
    print("✅ roadmap:", rd)
except Exception as e:
    print(f"⚠️ plans best-effort failed: {e}")

# 6) Memory (requires Qdrant + embeddings)
print("\n6) Memory (requires Qdrant + embeddings)...")
try:
    ok = mem_add("test_user", "Feeling stressed about work deadlines", "anxious", "Jittery Banana", 0.77, context={"demo": True})
    print("ℹ️ add_message:", ok)
    mems = mem_recall("test_user", "work stress", k=3)
    print("ℹ️ recall:", mems)
except Exception as e:
    print(f"⚠️ memory skipped/failed: {e}")

# 7) RAG retriever (Qdrant + embeddings)
print("\n7) RAG retriever (requires Qdrant + embeddings)...")
try:
    rag = RagService.default()
    out = rag.search("what is our refund policy?", top_k=3)
    print("ℹ️ rag.search hits:", len(out.get("hits", [])))
except Exception as e:
    print(f"⚠️ rag retriever skipped/failed: {e}")

# 8) NLP (spaCy + transformers models)
print("\n8) NLP analyze (models must be available)...")
try:
    res = analyze_text("I loved the talk but felt anxious during Q&A.")
    print("✅ analyze_text keys:", list(res.keys()))
except Exception as e:
    print(f"⚠️ NLP analyze failed (ok if models missing): {e}")

# 9) Reports assembly (best-effort, writes to analytics blob)
print("\n9) Reports...")
try:
    rep = report_build("test_session", "test_user")
    print("✅ report keys:", list(rep.keys()))
except Exception as e:
    print(f"⚠️ report build failed (tolerated): {e}")

# 10) Roleplay logging (into analysis blob; best-effort)
print("\n10) Roleplay...")
try:
    persona = list(PERSONAS.keys())[0]
    rp_record("test_session", persona, "assistant", "Let's try a tiny step tonight.", turn=1)
    print("✅ roleplay record OK")
except Exception as e:
    print(f"⚠️ roleplay record failed (tolerated): {e}")

print("\n=== TEST COMPLETE ===")
