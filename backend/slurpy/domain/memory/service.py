# -*- coding: utf-8 -*-
"""
Memory Service — lightweight semantic memory layer on Qdrant

Responsibilities
- Setup/maintain a per-user memory collection in Qdrant
- Store compact message memories with embeddings + helpful metadata
- Recall/top-k search (with time decay + quality tweaks)
- Simple insights & utilities (themes, trends, recent context)

Public API (module-level helpers provided at bottom for convenience):
- add_message(user_id, text, emotion, fruit, intensity, context) -> bool
- recall(user_id, query, k=5) -> List[str]
- get_user_insights(user_id) -> Dict[str, Any]
- search_by_theme(user_id, theme, limit=5) -> List[str]
- get_conversation_context(user_id, current_message) -> str
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import datetime as _dt
import os
import uuid

import numpy as np

from slurpy.domain.memory.repo import MemoryRepo
from slurpy.adapters.embedder import embed


# --------------------------- small helpers -----------------------------------
def _utc_now() -> _dt.datetime:
    return _dt.datetime.utcnow()

def _iso(ts: _dt.datetime) -> str:
    return ts.replace(microsecond=0).isoformat() + "Z"


# ------------------------------ Service --------------------------------------
class MemoryService:
    """
    Thin orchestration over MemoryRepo:
      - determines embedding dim once
      - ensures collection + indices
      - provides ranking/insights niceties
    """

    def __init__(self, repo: Optional[MemoryRepo] = None):
        self.repo = repo or MemoryRepo()
        self.connected = True   # repo creation will raise if not
        self.collection_ready = False
        self._embedding_dim: Optional[int] = None
        self._setup()

    # ---- bootstrap -----------------------------------------------------------
    def _setup(self) -> None:
        # infer embedding dim once (fallback 384)
        vec = embed("slurpy dimension probe") or []
        self._embedding_dim = len(vec) if vec else int(os.getenv("EMBEDDING_DIM", "384"))
        try:
            self.repo.ensure_collection(self._embedding_dim)
            self.repo.ensure_user_index()
            self.collection_ready = True
            cnt = self.repo.collection_points_count()
            print(
                f"📊 Memory collection `{self.repo.collection}` points: "
                f"{cnt if cnt is not None else 'unknown'}"
            )
        except Exception as e:
            print(f"❌ Memory setup failed: {e}")
            self.collection_ready = False

    # ---- writes --------------------------------------------------------------
    def add_message(
        self,
        user_id: str,
        text: str,
        emotion: str,
        fruit: str,
        intensity: float,
        context: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Store a memory for a user. Returns True on success, False on best-effort failure.
        """
        if not (self.connected and self.collection_ready):
            print("⚠️ Memory not ready — skipping add_message")
            return False

        vec = embed(text)
        if vec is None:
            print("⚠️ No embedding — skipping memory upsert")
            return False

        ts = _utc_now()
        payload: Dict[str, Any] = {
            "user_id": user_id,
            "text": text,
            "emotion": (emotion or "neutral"),
            "fruit": fruit,
            "intensity": float(intensity),
            "timestamp": _iso(ts),
            "date": ts.strftime("%Y-%m-%d"),
            "hour": ts.hour,
            "word_count": len(text.split()) if text else 0,
            "char_count": len(text),
            "context": context or {},
            "semantic_tags": self._generate_semantic_tags(text, emotion),
        }

        try:
            self.repo.upsert_point(point_id=str(uuid.uuid4()), vector=vec, payload=payload)
            return True
        except Exception as e:
            print(f"⚠️ add_message failed: {e}")
            return False

    # ---- reads ---------------------------------------------------------------
    def recall(self, user_id: str, query: str, k: int = 5, time_weight: float = 0.1) -> List[str]:
        """
        Retrieve up to k memory snippets most relevant to the query, with a small time decay bonus.
        """
        if not (self.connected and self.collection_ready):
            return []
        vec = embed(query)
        if vec is None:
            return []

        try:
            # Try filtered search first
            hits = self.repo.search_filtered(vec, user_id=user_id, limit=max(k * 2, 5))
            payloads = self._hits_to_payloads(hits)
            if not payloads:
                # Fallback: global search + post-filter
                ghits = self.repo.search_global(vec, limit=max(k * 3, 15))
                global_payloads = []
                for h in ghits:
                    payload_dict = self._mk_payload(h)
                    if payload_dict and payload_dict.get("user_id") == user_id:
                        global_payloads.append(payload_dict)
                payloads = global_payloads

            ranked = self._rank_memories(payloads, time_weight=time_weight)
            return [m["text"] for m in ranked[:k] if m.get("text")]
        except Exception as e:
            print(f"⚠️ recall failed: {e}")
            return []

    def get_user_insights(self, user_id: str) -> Dict[str, Any]:
        """
        Best-effort small analytics summary for a user's memories.
        """
        if not (self.connected and self.collection_ready):
            return {}
        try:
            points, _ = self.repo.scroll_user(user_id, limit=1000)
            payloads = []
            for p in points:
                payload = getattr(p, "payload", None)
                if payload:
                    payloads.append(dict(payload))
            
            if not payloads:
                return {}

            emotions = []
            semantic_tags: List[str] = []
            intensities = []
            
            for p in payloads:
                if not isinstance(p, dict):
                    continue
                    
                # Collect emotions
                emotion = p.get("emotion")
                if emotion:
                    emotions.append(str(emotion).lower())
                
                # Collect semantic tags
                tags = p.get("semantic_tags", [])
                if isinstance(tags, list):
                    semantic_tags.extend([str(t) for t in tags if t])
                
                # Collect intensities
                intensity = p.get("intensity")
                if intensity is not None:
                    try:
                        intensities.append(float(intensity))
                    except (ValueError, TypeError):
                        pass

            avg_intensity = float(np.mean(intensities)) if intensities else 0.0
            most_common_emotion = "neutral"
            if emotions:
                most_common_emotion = max(set(emotions), key=emotions.count)

            # Count theme occurrences
            common_themes = []
            if semantic_tags:
                unique_tags = set(semantic_tags)
                common_themes = [t for t in sorted(unique_tags) if semantic_tags.count(t) > 1]

            return {
                "total_memories": len(payloads),
                "most_common_emotion": most_common_emotion,
                "emotion_distribution": {e: emotions.count(e) for e in set(emotions)} if emotions else {},
                "common_themes": common_themes,
                "average_intensity": avg_intensity,
                "conversation_span_days": self._calculate_span_days(payloads),
                "recent_trend": self._recent_emotional_trend(payloads),
            }
        except Exception as e:
            print(f"⚠️ insights failed: {e}")
            return {}

    def search_by_theme(self, user_id: str, theme: str, limit: int = 5) -> List[str]:
        """
        Return up to `limit` memory texts tagged with a given theme.
        """
        if not (self.connected and self.collection_ready):
            return []
        try:
            points, _ = self.repo.scroll_user(user_id, limit=max(limit * 3, 50))
            out: List[str] = []
            for p in points:
                pay = getattr(p, "payload", None)
                if not pay:
                    continue
                    
                tags = pay.get("semantic_tags", [])
                text = pay.get("text")
                if isinstance(tags, list) and theme in tags and text:
                    out.append(str(text))
                    if len(out) >= limit:
                        break
            return out
        except Exception as e:
            print(f"⚠️ theme search failed: {e}")
            return []

    def get_conversation_context(self, user_id: str, current_message: str) -> str:
        """
        Build a tiny context block from recent + semantically related memories.
        """
        if not (self.connected and self.collection_ready):
            return ""
        try:
            recent = self._recent_texts(user_id, limit=3)
            similar = self.recall(user_id, current_message, k=3)
            bag: List[str] = []
            seen = set()
            for label, items in (("Recent", recent), ("Related", similar)):
                for txt in items:
                    t = (txt or "").strip()
                    if not t or t in seen or len(t) < 10:
                        continue
                    bag.append(f"{label}: {t}")
                    seen.add(t)
                    if len(bag) >= 5:
                        break
                if len(bag) >= 5:
                    break
            return "Previous conversation context:\n" + "\n".join(bag) if bag else ""
        except Exception as e:
            print(f"⚠️ context failed: {e}")
            return ""

    # ---- internals -----------------------------------------------------------
    @staticmethod
    def _hits_to_payloads(hits) -> List[Dict[str, Any]]:
        """Extract payloads from search hits with proper null checking."""
        out: List[Dict[str, Any]] = []
        if not hits:
            return out
            
        for h in hits:
            pay = getattr(h, "payload", None)
            if not pay:
                continue
                
            payload_dict = dict(pay)
            if not payload_dict.get("text"):
                continue
                
            score = getattr(h, "score", None)
            payload_dict["similarity_score"] = float(score) if score is not None else 0.0
            out.append(payload_dict)
        return out

    @staticmethod
    def _mk_payload(hit) -> Dict[str, Any]:
        """Create payload dict from a hit with proper null checking."""
        pay = getattr(hit, "payload", None)
        if not pay:
            return {}
            
        m = dict(pay)
        if not m:
            return {}
            
        score = getattr(hit, "score", None)
        m["similarity_score"] = float(score) if score is not None else 0.0
        return m

    def _recent_texts(self, user_id: str, limit: int) -> List[str]:
        """Get most recent memory texts for a user."""
        try:
            points, _ = self.repo.scroll_user(user_id, limit=max(limit * 3, 50))
            mems: List[Dict[str, Any]] = []
            
            for p in points:
                pay = getattr(p, "payload", None)
                if not pay:
                    continue
                    
                text = pay.get("text")
                if not text:
                    continue
                    
                mems.append({
                    "text": str(text),
                    "timestamp": str(pay.get("timestamp", "")),
                    "emotion": str(pay.get("emotion", "neutral")),
                })
            
            # Sort by timestamp descending
            mems.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return [m["text"] for m in mems[:limit]]
        except Exception as e:
            print(f"⚠️ _recent_texts failed: {e}")
            return []

    @staticmethod
    def _generate_semantic_tags(text: str, emotion: str) -> List[str]:
        """Generate semantic tags from text content and emotion."""
        tags = set()
        if emotion:
            tags.add(str(emotion).lower())
        
        t = (text or "").lower()

        def any_in(words: List[str]) -> bool:
            return any(w in t for w in words)

        if any_in(["work", "job", "career", "boss"]):
            tags.add("work")
        if any_in(["family", "parent", "mom", "dad", "sibling"]):
            tags.add("family")
        if any_in(["friend", "relationship", "partner", "dating"]):
            tags.add("relationships")
        if any_in(["school", "study", "exam", "class"]):
            tags.add("education")
        if any_in(["health", "doctor", "medicine", "sick"]):
            tags.add("health")
        if any_in(["money", "budget", "expensive", "debt"]):
            tags.add("finances")
        if any_in(["really", "very", "extremely", "so much"]):
            tags.add("high_intensity")
        if any_in(["better", "improving", "progress", "good"]):
            tags.add("positive_progress")
        if any_in(["worse", "harder", "difficult", "struggling"]):
            tags.add("challenging")
        
        return sorted(tags)

    @staticmethod
    def _rank_memories(memories: List[Dict[str, Any]], time_weight: float) -> List[Dict[str, Any]]:
        """
        Combine vector score + small recency bonus; penalize ultra-short snippets.
        """
        if not memories:
            return []
        
        now = _utc_now()
        out: List[Dict[str, Any]] = []
        
        for m in memories:
            if not isinstance(m, dict):
                continue
                
            score = float(m.get("similarity_score", 0.0))
            
            # Apply time decay bonus
            try:
                ts_raw = str(m.get("timestamp", ""))
                if ts_raw:
                    ts = _dt.datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                    days_ago = max(0.0, (now - ts).total_seconds() / 86400.0)
                    # 0.1 max bonus decaying by days, scaled by weight
                    decay = float(np.exp(-days_ago * max(time_weight, 0.0)))
                    score += decay * 0.1
            except (ValueError, TypeError, AttributeError):
                pass
            
            # Penalize very short memories
            text_len = len(str(m.get("text", "")))
            if text_len < 20:
                score -= 0.05
            
            m2 = dict(m)
            m2["final_score"] = score
            out.append(m2)
        
        return sorted(out, key=lambda x: x.get("final_score", 0.0), reverse=True)

    @staticmethod
    def _calculate_span_days(payloads: List[Dict[str, Any]]) -> int:
        """Calculate the span in days between earliest and latest memories."""
        if not payloads:
            return 0
            
        ts_list: List[_dt.datetime] = []
        for m in payloads:
            if not isinstance(m, dict):
                continue
                
            ts = m.get("timestamp")
            if not ts:
                continue
            try:
                ts_obj = _dt.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                ts_list.append(ts_obj)
            except (ValueError, TypeError, AttributeError):
                continue
        
        if len(ts_list) < 2:
            return 0
        
        return max(0, int((max(ts_list) - min(ts_list)).days))

    @staticmethod
    def _recent_emotional_trend(payloads: List[Dict[str, Any]]) -> str:
        """Analyze recent emotional trend from memory payloads."""
        try:
            # Filter and sort by timestamp
            recent = []
            for m in payloads:
                if isinstance(m, dict) and m.get("timestamp"):
                    recent.append(m)
            
            recent = sorted(recent, key=lambda x: x.get("timestamp", ""), reverse=True)[:5]
            
            if len(recent) < 3:
                return "insufficient_data"

            pos = {"joy", "excited", "happy", "content", "hopeful", "proud"}
            neg = {"sad", "anxious", "angry", "frustrated", "depressed", "worried"}

            scores: List[float] = []
            for m in recent:
                emo = str(m.get("emotion", "neutral")).lower()
                intensity_val = m.get("intensity", 0.5)
                try:
                    inten = float(intensity_val)
                except (ValueError, TypeError):
                    inten = 0.5
                
                if emo in pos:
                    scores.append(inten)
                elif emo in neg:
                    scores.append(-inten)
                else:
                    scores.append(0.0)

            if not scores:
                return "unknown"
                
            avg = float(np.mean(scores))
            if avg > 0.1:
                return "improving"
            elif avg < -0.1:
                return "declining"
            else:
                return "stable"
        except Exception:
            return "unknown"


# ------------------------ Singleton + convenience API ------------------------
_service = MemoryService()

def add_message(
    user_id: str,
    text: str,
    emotion: str,
    fruit: str,
    intensity: float,
    context: Optional[Dict[str, Any]] = None,
) -> bool:
    return _service.add_message(user_id, text, emotion, fruit, intensity, context)

def recall(user_id: str, query: str, k: int = 5) -> List[str]:
    return _service.recall(user_id, query, k=k)

def get_user_insights(user_id: str) -> Dict[str, Any]:
    return _service.get_user_insights(user_id)

def search_by_theme(user_id: str, theme: str, limit: int = 5) -> List[str]:
    return _service.search_by_theme(user_id, theme, limit=limit)

def get_conversation_context(user_id: str, current_message: str) -> str:
    return _service.get_conversation_context(user_id, current_message)


__all__ = [
    "MemoryService",
    "add_message",
    "recall",
    "get_user_insights",
    "search_by_theme",
    "get_conversation_context",
]