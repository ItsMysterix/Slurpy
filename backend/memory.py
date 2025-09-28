# backend/memory.py
"""
Enhanced Qdrant Cloud memory system with robust env loading and type-safe helpers.
Exposes module-level functions used by the rest of the backend:
  - add_message(user_id, text, emotion, fruit, intensity, context?)
  - recall(user_id, query, k=5)
  - get_user_insights(user_id)
  - search_by_theme(user_id, theme, limit=5)
  - get_conversation_context(user_id, current_message)
"""

import os
import uuid
import datetime
from typing import Dict, Any, List, Optional, Tuple

# Env loading — prefer project envs first
from dotenv import load_dotenv
if os.path.exists(".env.backend"):
    load_dotenv(".env.backend")
elif os.path.exists(".env.local"):
    load_dotenv(".env.local")
else:
    load_dotenv()  # fall back to default .env if present

from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams,
    Distance,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    PayloadSchemaType,
)

import numpy as np

# Embeddings (guarded import; we’ll fallback if this fails)
_embedder = None
_embedder_err: Optional[str] = None
_EMBED_MODEL = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")

try:
    from langchain_huggingface import HuggingFaceEmbeddings
    _embedder = HuggingFaceEmbeddings(model_name=_EMBED_MODEL)
except Exception as _e:
    _embedder_err = f"Embeddings unavailable: {type(_e).__name__}: {_e}"
    _embedder = None

# ── Configuration ─────────────────────────────────────────────────────────
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API = os.getenv("QDRANT_API_KEY")
COLL_MEM = os.getenv("MEMORY_COLLECTION", "user_memory_v2")

print(f"🔍 Memory System - QDRANT_URL: {QDRANT_URL}")
print(f"🔍 Memory System - API Key present: {bool(QDRANT_API)}")
if _embedder is None:
    print(f"⚠️ {_embedder_err or 'Embeddings backend not initialized'} — memory will degrade gracefully.")

# ── Utilities ──────────────────────────────────────────────────────────────
def _utc_now() -> datetime.datetime:
    return datetime.datetime.utcnow()

def _embed(text: str) -> Optional[List[float]]:
    """Return embedding vector for text or None if not available."""
    if not text:
        return None
    if _embedder is None:
        return None
    try:
        vec = _embedder.embed_query(text)
        # Ensure it’s a plain list[float]
        return [float(x) for x in vec]
    except Exception as e:
        print(f"⚠️ Embedding failed: {e}")
        return None

# ── Core class ─────────────────────────────────────────────────────────────
class MemorySystem:
    def __init__(self) -> None:
        self.client: Optional[QdrantClient] = None
        self.connected: bool = False
        self.collection_ready: bool = False
        self._embedding_dim: Optional[int] = None
        self._initialize_connection()

    # ── Connection / setup ────────────────────────────────────────────────
    def _initialize_connection(self) -> None:
        """Initialize connection with robust error handling."""
        if not QDRANT_URL or not QDRANT_API:
            print("⚠️ Missing QDRANT_URL or QDRANT_API_KEY — memory will be disabled")
            return
        if _embedder is None:
            print("⚠️ No embedding model — semantic memory disabled (store/recall may be limited)")
        try:
            print("🔄 Connecting to Qdrant Cloud...")
            self.client = QdrantClient(
                url=QDRANT_URL,
                api_key=QDRANT_API,
                timeout=30,
                prefer_grpc=False,  # HTTP tends to be simpler for local/dev
            )
            # Smoke test
            collections = self.client.get_collections().collections
            names = [c.name for c in collections]
            print(f"✅ Connected successfully! Available collections: {names}")
            self.connected = True
            self._setup_collection()
        except Exception as e:
            print(f"❌ Failed to connect to Qdrant: {e}")
            self.connected = False
            self.client = None

    def _setup_collection(self) -> None:
        """Ensure collection exists with correct vector size and index."""
        if self.client is None:
            print("❌ Client is None, cannot setup collection")
            return

        try:
            # Determine embedding dimension once
            if _embedder is not None and self._embedding_dim is None:
                test = _embed("test") or []
                self._embedding_dim = len(test) if test else None

            collections = self.client.get_collections().collections
            names = [c.name for c in collections]

            if COLL_MEM not in names:
                print(f"📦 Creating new collection: {COLL_MEM}")
                if not self._embedding_dim:
                    # If we don’t know the embedding size, try a sane default for MiniLM-L6
                    self._embedding_dim = int(os.getenv("EMBEDDING_DIM", "384"))
                    print(f"⚠️ Couldn’t infer embedding dim; using default {self._embedding_dim}")

                self.client.create_collection(
                    collection_name=COLL_MEM,
                    vectors_config=VectorParams(
                        size=self._embedding_dim or 384,
                        distance=Distance.COSINE,
                    ),
                )
                print(f"✅ Created collection {COLL_MEM}")
            else:
                print(f"📋 Using existing collection {COLL_MEM}")

            # Try to ensure payload index for user_id
            try:
                self.client.create_payload_index(
                    collection_name=COLL_MEM,
                    field_name="user_id",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                print("✅ Created index for user_id field")
            except Exception:
                # Probably exists already
                print("ℹ️ user_id index exists (or cannot be created in this plan)")

            # Verify
            info = self.client.get_collection(COLL_MEM)
            # Newer qdrant-client may expose .points_count; if not, skip
            count = getattr(info, "points_count", "unknown")
            print(f"📊 Collection has {count} stored memories")
            self.collection_ready = True

        except Exception as e:
            print(f"❌ Failed to setup collection: {e}")
            self.collection_ready = False

    # ── Public ops ────────────────────────────────────────────────────────
    def add_message(
        self,
        user_id: str,
        text: str,
        emotion: str,
        fruit: str,
        intensity: float,
        context: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Add a message to user's memory with enhanced metadata."""
        if not self.connected or not self.collection_ready or self.client is None:
            print("⚠️ Memory system not ready — skipping message storage")
            return False

        try:
            point_id = str(uuid.uuid4())
            ts = _utc_now()

            vector = _embed(text)
            if vector is None:
                # If we can't embed, we can still store payload-only, but Qdrant requires vectors
                print("⚠️ No embedding — skipping memory upsert")
                return False

            payload: Dict[str, Any] = {
                "user_id": user_id,
                "text": text,
                "emotion": emotion,
                "fruit": fruit,
                "intensity": float(intensity),
                "timestamp": ts.isoformat(),
                "date": ts.strftime("%Y-%m-%d"),
                "hour": ts.hour,
                "word_count": len(text.split()) if text else 0,
                "char_count": len(text),
                "context": context or {},
            }
            payload["semantic_tags"] = self._generate_semantic_tags(text, emotion)

            point = PointStruct(id=point_id, vector=vector, payload=payload)

            # Upsert (idempotent insert/update)
            self.client.upsert(collection_name=COLL_MEM, points=[point])
            print(f"💾 Stored memory for user {user_id[:8]}... (ID: {point_id})")
            return True

        except Exception as e:
            print(f"⚠️ Failed to add message: {e}")
            return False

    def recall(
        self,
        user_id: str,
        query: str,
        k: int = 5,
        time_weight: float = 0.1,
        emotion_match: bool = False,  # kept for signature compatibility
    ) -> List[str]:
        """Recall relevant memories for a user with semantic search + recency rerank."""
        if not self.connected or not self.collection_ready or self.client is None:
            print("⚠️ Memory system not ready — no recall available")
            return []

        try:
            memories = self._semantic_search(user_id, query, max(k * 2, 5))
            if memories:
                ranked = self._rank_memories(memories, query, time_weight)
                out = [m["text"] for m in ranked[:k] if m.get("text")]
                print(f"🧠 Recalled {len(out)} memories for user {user_id[:8]}...")
                return out

            print("🔄 No semantic matches, trying recent memories...")
            recent = self._get_recent_memories(user_id, k)
            if recent:
                print(f"📚 Found {len(recent)} recent memories")
                return recent

            print(f"💭 No memories found for user {user_id[:8]}...")
            return []

        except Exception as e:
            print(f"⚠️ Recall failed: {e}")
            return []

    def get_user_insights(self, user_id: str) -> Dict[str, Any]:
        """Aggregate simple insights for a user's stored memories."""
        if not self.connected or not self.collection_ready or self.client is None:
            return {}

        try:
            points, _ = self.client.scroll(
                collection_name=COLL_MEM,
                scroll_filter=Filter(
                    must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
                ),
                limit=1000,
                with_payload=True,
            )

            if not points:
                return {}

            payloads = [p.payload for p in points if p.payload]
            emotions = [p.get("emotion", "neutral") for p in payloads]
            semantic_tags: List[str] = []
            for p in payloads:
                tags = p.get("semantic_tags", [])
                if isinstance(tags, list):
                    semantic_tags.extend(tags)

            avg_intensity = float(np.mean([float(p.get("intensity", 0.5)) for p in payloads])) if payloads else 0.0

            insights = {
                "total_memories": len(payloads),
                "most_common_emotion": max(set(emotions), key=emotions.count) if emotions else "neutral",
                "emotion_distribution": {e: emotions.count(e) for e in set(emotions)},
                "common_themes": [t for t in set(semantic_tags) if semantic_tags.count(t) > 1],
                "average_intensity": avg_intensity,
                "conversation_span_days": self._calculate_span_days(payloads),
                "recent_trend": self._get_recent_emotional_trend(payloads),
            }
            return insights

        except Exception as e:
            print(f"⚠️ Failed to get insights: {e}")
            return {}

    def search_by_theme(self, user_id: str, theme: str, limit: int = 5) -> List[str]:
        """Fetch memories by a semantic tag/theme."""
        if not self.connected or not self.collection_ready or self.client is None:
            return []

        try:
            points, _ = self.client.scroll(
                collection_name=COLL_MEM,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                        FieldCondition(key="semantic_tags", match=MatchValue(value=theme)),
                    ]
                ),
                limit=limit,
                with_payload=True,
            )
            out: List[str] = []
            for p in points:
                if p.payload and p.payload.get("text"):
                    out.append(p.payload["text"])
            return out
        except Exception as e:
            print(f"⚠️ Theme search failed: {e}")
            return []

    def get_conversation_context(self, user_id: str, current_message: str) -> str:
        """Compose a short context block from recent and similar memories."""
        if not self.connected or not self.collection_ready or self.client is None:
            return ""

        try:
            recent = self._get_recent_memories(user_id, 3)
            similar = self.recall(user_id, current_message, k=3)
            bag: List[str] = []
            seen = set()

            for label, items in (("Recent", recent), ("Related", similar)):
                for txt in items:
                    if not txt or txt in seen or len(txt.strip()) < 10:
                        continue
                    bag.append(f"{label}: {txt}")
                    seen.add(txt)
                    if len(bag) >= 5:
                        break
                if len(bag) >= 5:
                    break

            return "Previous conversation context:\n" + "\n".join(bag) if bag else ""
        except Exception as e:
            print(f"⚠️ Context retrieval failed: {e}")
            return ""

    # ── Internals ─────────────────────────────────────────────────────────
    def _generate_semantic_tags(self, text: str, emotion: str) -> List[str]:
        """Heuristic tags for better search/retrieval."""
        tags = set()
        if emotion:
            tags.add(emotion.lower())

        t = (text or "").lower()

        def any_in(words: List[str]) -> bool:
            return any(w in t for w in words)

        if any_in(["work", "job", "career", "boss"]): tags.add("work")
        if any_in(["family", "parent", "mom", "dad", "sibling"]): tags.add("family")
        if any_in(["friend", "relationship", "partner", "dating"]): tags.add("relationships")
        if any_in(["school", "study", "exam", "class"]): tags.add("education")
        if any_in(["health", "doctor", "medicine", "sick"]): tags.add("health")
        if any_in(["money", "budget", "expensive", "debt"]): tags.add("finances")

        if any_in(["really", "very", "extremely", "so much"]): tags.add("high_intensity")
        if any_in(["better", "improving", "progress", "good"]): tags.add("positive_progress")
        if any_in(["worse", "harder", "difficult", "struggling"]): tags.add("challenging")

        return list(tags)

    def _semantic_search(self, user_id: str, query: str, limit: int) -> List[Dict[str, Any]]:
        """Semantic search with user filtering and resilient fallbacks."""
        if self.client is None:
            return []
        vec = _embed(query)
        if vec is None:
            return []

        try:
            # First attempt: filtered search + score threshold if supported
            try:
                results = self.client.search(
                    collection_name=COLL_MEM,
                    query_vector=vec,
                    query_filter=Filter(
                        must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
                    ),
                    limit=limit,
                    with_payload=True,
                    score_threshold=0.3,  # may not be supported in older clients; fallback below
                )
            except TypeError:
                # Older qdrant-client without score_threshold
                results = self.client.search(
                    collection_name=COLL_MEM,
                    query_vector=vec,
                    query_filter=Filter(
                        must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
                    ),
                    limit=limit,
                    with_payload=True,
                )

            memories: List[Dict[str, Any]] = []
            for hit in results:
                if hit.payload and hit.payload.get("text"):
                    m = dict(hit.payload)
                    # In cosine, Qdrant returns similarity score (higher is better). Treat uniformly.
                    m["similarity_score"] = float(getattr(hit, "score", 0.0) or 0.0)
                    memories.append(m)
            if memories:
                return memories

            # Fallback: global search then manual filter
            try:
                results = self.client.search(
                    collection_name=COLL_MEM,
                    query_vector=vec,
                    limit=limit * 3,
                    with_payload=True,
                )
            except TypeError:
                results = self.client.search(
                    collection_name=COLL_MEM,
                    query_vector=vec,
                    limit=limit * 3,
                    with_payload=True,
                )

            memories = []
            for hit in results:
                if hit.payload and hit.payload.get("text") and hit.payload.get("user_id") == user_id:
                    m = dict(hit.payload)
                    m["similarity_score"] = float(getattr(hit, "score", 0.0) or 0.0)
                    memories.append(m)
                    if len(memories) >= limit:
                        break
            return memories

        except Exception as e:
            print(f"⚠️ Semantic search failed: {e}")
            return []

    def _get_recent_memories(self, user_id: str, limit: int) -> List[str]:
        """Fetch most recent memories by timestamp field."""
        if self.client is None:
            return []
        try:
            points, _ = self.client.scroll(
                collection_name=COLL_MEM,
                scroll_filter=Filter(
                    must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
                ),
                limit=max(limit * 3, 20),
                with_payload=True,
            )
            mems: List[Dict[str, Any]] = []
            for p in points:
                if p.payload and p.payload.get("text"):
                    mems.append(
                        {
                            "text": p.payload["text"],
                            "timestamp": p.payload.get("timestamp", ""),
                            "emotion": p.payload.get("emotion", "neutral"),
                        }
                    )
            mems.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return [m["text"] for m in mems[:limit]]
        except Exception as e:
            print(f"⚠️ Recent memories fetch failed: {e}")
            return []

    def _rank_memories(self, memories: List[Dict[str, Any]], query: str, time_weight: float) -> List[Dict[str, Any]]:
        """Rank by similarity, recency, and heuristics."""
        if not memories:
            return []
        now = _utc_now()

        for m in memories:
            score = float(m.get("similarity_score", 0.0))

            # Recency boost (exponential decay)
            try:
                ts_raw = m.get("timestamp", "")
                ts = datetime.datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                days_ago = (now - ts).days
                score += float(np.exp(-days_ago * max(time_weight, 0.0))) * 0.1
            except Exception:
                pass

            # Short text penalty
            if len(m.get("text", "")) < 20:
                score -= 0.05

            m["final_score"] = score

        return sorted(memories, key=lambda x: x.get("final_score", 0.0), reverse=True)

    def _calculate_span_days(self, memories: List[Dict[str, Any]]) -> int:
        """Inclusive time span in days between oldest and newest timestamp."""
        ts_list: List[datetime.datetime] = []
        for m in memories:
            ts = m.get("timestamp")
            if not ts:
                continue
            try:
                ts_list.append(datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00")))
            except Exception:
                continue
        if len(ts_list) < 2:
            return 0
        return (max(ts_list) - min(ts_list)).days

    def _get_recent_emotional_trend(self, memories: List[Dict[str, Any]]) -> str:
        """Simple recent trend from last ~5 memories using emotion + intensity."""
        try:
            recent = sorted(
                [m for m in memories if m.get("timestamp")],
                key=lambda x: x["timestamp"],
                reverse=True,
            )[:5]
            if len(recent) < 3:
                return "insufficient_data"

            pos = {"joy", "excited", "happy", "content", "hopeful", "proud"}
            neg = {"sad", "anxious", "angry", "frustrated", "depressed", "worried"}

            scores: List[float] = []
            for m in recent:
                emo = str(m.get("emotion", "neutral")).lower()
                inten = float(m.get("intensity", 0.5))
                if emo in pos:
                    scores.append(+inten)
                elif emo in neg:
                    scores.append(-inten)
                else:
                    scores.append(0.0)

            avg = float(np.mean(scores))
            if avg > 0.1:
                return "improving"
            if avg < -0.1:
                return "declining"
            return "stable"
        except Exception:
            return "unknown"

# ── Global instance and public API (backwards compatible) ───────────────────
_memory_system = MemorySystem()

def add_message(user_id: str, text: str, emotion: str, fruit: str, intensity: float,
                context: Optional[Dict[str, Any]] = None) -> bool:
    return _memory_system.add_message(user_id, text, emotion, fruit, intensity, context)

def recall(user_id: str, query: str, k: int = 5) -> List[str]:
    return _memory_system.recall(user_id, query, k)

def get_user_insights(user_id: str) -> Dict[str, Any]:
    return _memory_system.get_user_insights(user_id)

def search_by_theme(user_id: str, theme: str, limit: int = 5) -> List[str]:
    return _memory_system.search_by_theme(user_id, theme, limit)

def get_conversation_context(user_id: str, current_message: str) -> str:
    return _memory_system.get_conversation_context(user_id, current_message)

# Startup banner
if _memory_system.connected and _memory_system.collection_ready:
    print("🎉 Enhanced Slurpy memory system is ready!")
    print("✅ Features available:")
    print("  - Semantic memory search")
    print("  - Conversation context tracking")
    print("  - User insight analytics")
    print("  - Theme-based memory retrieval")
    print("  - Temporal memory ranking")
else:
    print("💤 Running without enhanced memory features")

# Optional self-test (run as a script)
if __name__ == "__main__":
    u = "test_user_123"
    print("\n🧪 Testing memory system...")

    samples = [
        ("I'm feeling really anxious about my job interview tomorrow", "anxious", 0.8),
        ("Had a great day with my family at the park", "joy", 0.9),
        ("Work has been so stressful lately, my boss is demanding", "frustrated", 0.7),
        ("I'm proud of how I handled that difficult conversation", "proud", 0.8),
        ("Feeling overwhelmed with all the deadlines", "anxious", 0.6),
    ]

    for text, emo, inten in samples:
        ok = add_message(u, text, emo, f"Test {emo}", inten)
        print(f"📝 Added memory: {ok}")

    print("\n🔍 Testing recall...")
    r = recall(u, "work stress", k=3)
    for i, m in enumerate(r, 1):
        print(f"  {i}. {m}")

    print("\n📊 Testing insights...")
    ins = get_user_insights(u)
    print(f"  Total memories: {ins.get('total_memories', 0)}")
    print(f"  Most common emotion: {ins.get('most_common_emotion', 'unknown')}")
    print(f"  Common themes: {ins.get('common_themes', [])}")

    print("\n💬 Testing conversation context...")
    ctx = get_conversation_context(u, "I'm worried about tomorrow")
    print(f"Context: {ctx[:200]}..." if len(ctx) > 200 else f"Context: {ctx}")

    print("\n✅ Memory system test complete!")
