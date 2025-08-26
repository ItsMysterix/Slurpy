"""
memory.py – Enhanced Qdrant Cloud memory system with proper type handling
"""
import uuid, datetime, os, json, hashlib
from typing import Dict, Any, List, Optional, Tuple, Union
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct, Filter, FieldCondition, MatchValue, Range
from langchain_huggingface import HuggingFaceEmbeddings
import numpy as np

# ── Enhanced configuration ─────────────────────────────────────────────
load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API = os.getenv("QDRANT_API_KEY") 
COLL_MEM = "user_memory_v2"  # New collection name for enhanced version
EMBED_MODEL = "all-MiniLM-L6-v2"

print(f"🔍 Memory System - QDRANT_URL: {QDRANT_URL}")
print(f"🔍 Memory System - API Key present: {bool(QDRANT_API)}")

_embedder = HuggingFaceEmbeddings(model_name=EMBED_MODEL)

class MemorySystem:
    def __init__(self):
        self.client: Optional[QdrantClient] = None
        self.connected = False
        self.collection_ready = False
        self._initialize_connection()
    
    def _initialize_connection(self):
        """Initialize connection with robust error handling"""
        if not QDRANT_URL or not QDRANT_API:
            print("⚠️ Missing QDRANT_URL or QDRANT_API_KEY - memory will be disabled")
            return
        
        try:
            print("🔄 Connecting to Qdrant Cloud...")
            self.client = QdrantClient(
                url=QDRANT_URL,
                api_key=QDRANT_API,
                timeout=30,
                prefer_grpc=False  # Use HTTP for better compatibility
            )
            
            # Test connection with proper None check
            if self.client is not None:
                collections = self.client.get_collections().collections
                collection_names = [c.name for c in collections]
                print(f"✅ Connected successfully! Available collections: {collection_names}")
                self.connected = True
                
                # Setup collection
                self._setup_collection()
            
        except Exception as e:
            print(f"❌ Failed to connect to Qdrant: {e}")
            self.connected = False
            self.client = None
    
    def _setup_collection(self):
        """Setup collection with proper configuration"""
        if self.client is None:
            print("❌ Client is None, cannot setup collection")
            return
            
        try:
            collections = self.client.get_collections().collections
            collection_names = [c.name for c in collections]
            
            if COLL_MEM not in collection_names:
                print(f"📦 Creating new collection: {COLL_MEM}")
                
                # Get embedding dimension
                test_embedding = _embedder.embed_query("test")
                embedding_dim = len(test_embedding)
                print(f"📏 Embedding dimension: {embedding_dim}")
                
                # Create collection with optimized settings
                self.client.create_collection(
                    collection_name=COLL_MEM,
                    vectors_config=VectorParams(
                        size=embedding_dim,
                        distance=Distance.COSINE
                    )
                )
                print(f"✅ Created collection {COLL_MEM}")
                
                # Create payload index for user_id field for efficient filtering
                try:
                    from qdrant_client.models import PayloadSchemaType
                    self.client.create_payload_index(
                        collection_name=COLL_MEM,
                        field_name="user_id",
                        field_schema=PayloadSchemaType.KEYWORD
                    )
                    print("✅ Created index for user_id field")
                except Exception as index_error:
                    print(f"⚠️ Could not create user_id index: {index_error}")
                    print("Memory will work but queries may be slower")
                    
            else:
                print(f"📋 Using existing collection {COLL_MEM}")
                
                # Try to create index if it doesn't exist
                try:
                    from qdrant_client.models import PayloadSchemaType
                    self.client.create_payload_index(
                        collection_name=COLL_MEM,
                        field_name="user_id",
                        field_schema=PayloadSchemaType.KEYWORD
                    )
                    print("✅ Created missing index for user_id field")
                except Exception:
                    # Index probably already exists or we don't have permission
                    pass
            
            # Verify collection is accessible
            collection_info = self.client.get_collection(COLL_MEM)
            print(f"📊 Collection has {collection_info.points_count} stored memories")
            self.collection_ready = True
            
        except Exception as e:
            print(f"❌ Failed to setup collection: {e}")
            self.collection_ready = False
    
    def add_message(self, user_id: str, text: str, emotion: str, fruit: str, intensity: float, 
                   context: Optional[Dict[str, Any]] = None) -> bool:
        """Add a message to user's memory with enhanced metadata"""
        if not self.connected or not self.collection_ready or self.client is None:
            print("⚠️ Memory system not ready - skipping message storage")
            return False
        
        try:
            # Create unique ID that's compatible with Qdrant (UUID format)
            timestamp = datetime.datetime.utcnow()
            # Use UUID instead of concatenated string
            point_id = str(uuid.uuid4())
            
            # Generate embedding
            vector = _embedder.embed_query(text)
            
            # Enhanced payload with better metadata
            payload: Dict[str, Any] = {
                "user_id": user_id,
                "text": text,
                "emotion": emotion,
                "fruit": fruit,
                "intensity": float(intensity),
                "timestamp": timestamp.isoformat(),
                "date": timestamp.strftime("%Y-%m-%d"),
                "hour": timestamp.hour,
                "word_count": len(text.split()),
                "char_count": len(text),
                "context": context or {}
            }
            
            # Add semantic tags for better retrieval
            payload["semantic_tags"] = self._generate_semantic_tags(text, emotion)
            
            # Create and insert point
            point = PointStruct(
                id=point_id,
                vector=vector,
                payload=payload
            )
            
            result = self.client.upsert(
                collection_name=COLL_MEM,
                points=[point]
            )
            
            print(f"💾 Stored memory for user {user_id[:8]}... (ID: {point_id})")
            return True
            
        except Exception as e:
            print(f"⚠️ Failed to add message: {e}")
            return False
    
    def _generate_semantic_tags(self, text: str, emotion: str) -> List[str]:
        """Generate semantic tags for better search"""
        tags = [emotion]
        
        text_lower = text.lower()
        
        # Topic tags
        if any(word in text_lower for word in ["work", "job", "career", "boss"]):
            tags.append("work")
        if any(word in text_lower for word in ["family", "parent", "mom", "dad", "sibling"]):
            tags.append("family")
        if any(word in text_lower for word in ["friend", "relationship", "partner", "dating"]):
            tags.append("relationships")
        if any(word in text_lower for word in ["school", "study", "exam", "class"]):
            tags.append("education")
        if any(word in text_lower for word in ["health", "doctor", "medicine", "sick"]):
            tags.append("health")
        if any(word in text_lower for word in ["money", "budget", "expensive", "debt"]):
            tags.append("finances")
        
        # Emotional intensity tags
        if any(word in text_lower for word in ["really", "very", "extremely", "so much"]):
            tags.append("high_intensity")
        
        # Progress tags
        if any(word in text_lower for word in ["better", "improving", "progress", "good"]):
            tags.append("positive_progress")
        if any(word in text_lower for word in ["worse", "harder", "difficult", "struggling"]):
            tags.append("challenging")
        
        return list(set(tags))  # Remove duplicates
    
    def recall(self, user_id: str, query: str, k: int = 5, 
               time_weight: float = 0.1, emotion_match: bool = False) -> List[str]:
        """Enhanced recall with multiple search strategies"""
        if not self.connected or not self.collection_ready or self.client is None:
            print("⚠️ Memory system not ready - no recall available")
            return []
        
        try:
            # Strategy 1: Semantic similarity search with user filter
            memories = self._semantic_search(user_id, query, k * 2)  # Get more candidates
            
            if memories:
                # Strategy 2: Re-rank by relevance and recency
                ranked_memories = self._rank_memories(memories, query, time_weight)
                
                # Return top k
                result = [mem["text"] for mem in ranked_memories[:k]]
                print(f"🧠 Recalled {len(result)} memories for user {user_id[:8]}...")
                return result
            
            # Fallback: Get recent memories if no semantic matches
            print(f"🔄 No semantic matches, trying recent memories...")
            recent_memories = self._get_recent_memories(user_id, k)
            
            if recent_memories:
                print(f"📚 Found {len(recent_memories)} recent memories")
                return recent_memories
            
            print(f"💭 No memories found for user {user_id[:8]}...")
            return []
            
        except Exception as e:
            print(f"⚠️ Recall failed: {e}")
            return []
    
    def _semantic_search(self, user_id: str, query: str, limit: int) -> List[Dict[str, Any]]:
        """Semantic search with user filtering and fallback strategies"""
        if self.client is None:
            return []
            
        try:
            query_vector = _embedder.embed_query(query)
            
            # Try search with user filter first
            try:
                search_result = self.client.search(
                    collection_name=COLL_MEM,
                    query_vector=query_vector,
                    query_filter=Filter(
                        must=[
                            FieldCondition(
                                key="user_id",
                                match=MatchValue(value=user_id)
                            )
                        ]
                    ),
                    limit=limit,
                    with_payload=True,
                    score_threshold=0.3
                )
                
                memories = []
                for hit in search_result:
                    if hit.payload and hit.payload.get("text"):
                        memory = dict(hit.payload)
                        memory["similarity_score"] = hit.score
                        memories.append(memory)
                
                return memories
                
            except Exception as filter_error:
                print(f"⚠️ Filtered search failed: {filter_error}")
                
                # Fallback: Search all and filter manually
                print("🔄 Trying manual filtering...")
                search_result = self.client.search(
                    collection_name=COLL_MEM,
                    query_vector=query_vector,
                    limit=limit * 3,  # Get more to filter
                    with_payload=True,
                    score_threshold=0.3
                )
                
                memories = []
                for hit in search_result:
                    if (hit.payload and 
                        hit.payload.get("text") and 
                        hit.payload.get("user_id") == user_id):
                        memory = dict(hit.payload)
                        memory["similarity_score"] = hit.score
                        memories.append(memory)
                        if len(memories) >= limit:
                            break
                
                return memories
            
        except Exception as e:
            print(f"⚠️ Semantic search failed completely: {e}")
            return []
    
    def _get_recent_memories(self, user_id: str, limit: int) -> List[str]:
        """Get recent memories for a user"""
        if self.client is None:
            return []
            
        try:
            # Scroll through user's memories
            scroll_result = self.client.scroll(
                collection_name=COLL_MEM,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="user_id",
                            match=MatchValue(value=user_id)
                        )
                    ]
                ),
                limit=limit * 3,  # Get more to sort by time
                with_payload=True
            )
            
            memories = []
            for point in scroll_result[0]:
                if point.payload and point.payload.get("text"):
                    memories.append({
                        "text": point.payload["text"],
                        "timestamp": point.payload.get("timestamp", ""),
                        "emotion": point.payload.get("emotion", "neutral")
                    })
            
            # Sort by timestamp (most recent first)
            memories.sort(key=lambda x: x["timestamp"], reverse=True)
            
            return [mem["text"] for mem in memories[:limit]]
            
        except Exception as e:
            print(f"⚠️ Recent memories fetch failed: {e}")
            return []
    
    def _rank_memories(self, memories: List[Dict[str, Any]], query: str, time_weight: float) -> List[Dict[str, Any]]:
        """Rank memories by relevance, recency, and other factors"""
        if not memories:
            return []
        
        current_time = datetime.datetime.utcnow()
        
        for memory in memories:
            score = memory.get("similarity_score", 0.0)
            
            # Time decay factor
            try:
                mem_time = datetime.datetime.fromisoformat(memory["timestamp"].replace("Z", "+00:00"))
                days_ago = (current_time - mem_time).days
                time_factor = np.exp(-days_ago * time_weight)  # Exponential decay
                score += time_factor * 0.1  # Small boost for recent memories
            except:
                pass
            
            # Emotional relevance boost
            query_lower = query.lower()
            mem_emotion = memory.get("emotion", "").lower()
            if any(emo_word in query_lower for emo_word in ["sad", "happy", "angry", "anxious"]):
                if mem_emotion in query_lower:
                    score += 0.1
            
            # Length penalty for very short memories
            text_length = len(memory.get("text", ""))
            if text_length < 20:
                score -= 0.05
            
            memory["final_score"] = score
        
        # Sort by final score
        return sorted(memories, key=lambda x: x.get("final_score", 0), reverse=True)
    
    def get_user_insights(self, user_id: str) -> Dict[str, Any]:
        """Get insights about a user's conversation patterns"""
        if not self.connected or not self.collection_ready or self.client is None:
            return {}
        
        try:
            # Get all user memories
            scroll_result = self.client.scroll(
                collection_name=COLL_MEM,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="user_id",
                            match=MatchValue(value=user_id)
                        )
                    ]
                ),
                limit=1000,
                with_payload=True
            )
            
            if not scroll_result[0]:
                return {}
            
            memories = [point.payload for point in scroll_result[0] if point.payload]
            
            # Analyze patterns
            emotions = [mem.get("emotion", "neutral") for mem in memories]
            semantic_tags = []
            for mem in memories:
                tags = mem.get("semantic_tags", [])
                if isinstance(tags, list):
                    semantic_tags.extend(tags)
            
            # Calculate insights
            insights = {
                "total_memories": len(memories),
                "most_common_emotion": max(set(emotions), key=emotions.count) if emotions else "neutral",
                "emotion_distribution": {emotion: emotions.count(emotion) for emotion in set(emotions)},
                "common_themes": [tag for tag in set(semantic_tags) if semantic_tags.count(tag) > 1],
                "average_intensity": float(np.mean([mem.get("intensity", 0.5) for mem in memories])),
                "conversation_span_days": self._calculate_span_days(memories),
                "recent_trend": self._get_recent_emotional_trend(memories)
            }
            
            return insights
            
        except Exception as e:
            print(f"⚠️ Failed to get insights: {e}")
            return {}
    
    def _calculate_span_days(self, memories: List[Dict[str, Any]]) -> int:
        """Calculate how many days the conversation history spans"""
        try:
            timestamps = []
            for mem in memories:
                if mem.get("timestamp"):
                    try:
                        ts = datetime.datetime.fromisoformat(mem["timestamp"].replace("Z", "+00:00"))
                        timestamps.append(ts)
                    except:
                        continue
            
            if len(timestamps) < 2:
                return 0
            
            return (max(timestamps) - min(timestamps)).days
            
        except Exception:
            return 0
    
    def _get_recent_emotional_trend(self, memories: List[Dict[str, Any]]) -> str:
        """Analyze recent emotional trend"""
        try:
            # Sort by timestamp, get last 5 memories
            recent_memories = sorted(
                [mem for mem in memories if mem.get("timestamp")],
                key=lambda x: x["timestamp"],
                reverse=True
            )[:5]
            
            if len(recent_memories) < 3:
                return "insufficient_data"
            
            # Simple trend analysis
            positive_emotions = ["joy", "excited", "happy", "content", "hopeful", "proud"]
            negative_emotions = ["sad", "anxious", "angry", "frustrated", "depressed", "worried"]
            
            recent_scores = []
            for mem in recent_memories:
                emotion = mem.get("emotion", "neutral")
                intensity = mem.get("intensity", 0.5)
                
                if emotion in positive_emotions:
                    recent_scores.append(float(intensity))
                elif emotion in negative_emotions:
                    recent_scores.append(-float(intensity))
                else:
                    recent_scores.append(0.0)
            
            avg_recent = float(np.mean(recent_scores))
            if avg_recent > 0.1:
                return "improving"
            elif avg_recent < -0.1:
                return "declining"
            else:
                return "stable"
                
        except Exception:
            return "unknown"
    
    def search_by_theme(self, user_id: str, theme: str, limit: int = 5) -> List[str]:
        """Search memories by specific theme/topic"""
        if not self.connected or not self.collection_ready or self.client is None:
            return []
        
        try:
            # Search by semantic tags
            search_result = self.client.scroll(
                collection_name=COLL_MEM,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="user_id",
                            match=MatchValue(value=user_id)
                        ),
                        FieldCondition(
                            key="semantic_tags",
                            match=MatchValue(value=theme)
                        )
                    ]
                ),
                limit=limit,
                with_payload=True
            )
            
            memories = []
            for point in search_result[0]:
                if point.payload and point.payload.get("text"):
                    memories.append(point.payload["text"])
            
            return memories
            
        except Exception as e:
            print(f"⚠️ Theme search failed: {e}")
            return []
    
    def get_conversation_context(self, user_id: str, current_message: str) -> str:
        """Get relevant conversation context for the current message"""
        if not self.connected or not self.collection_ready:
            return ""
        
        try:
            # Get recent memories and similar memories
            recent = self._get_recent_memories(user_id, 3)
            similar = self.recall(user_id, current_message, k=3)
            
            # Combine and deduplicate
            all_memories = []
            seen = set()
            
            for memory_list, label in [(recent, "Recent"), (similar, "Related")]:
                for memory in memory_list:
                    if memory not in seen and len(memory.strip()) > 10:
                        all_memories.append(f"{label}: {memory}")
                        seen.add(memory)
                        if len(all_memories) >= 5:  # Limit context length
                            break
                if len(all_memories) >= 5:
                    break
            
            if all_memories:
                return "Previous conversation context:\n" + "\n".join(all_memories)
            else:
                return ""
                
        except Exception as e:
            print(f"⚠️ Context retrieval failed: {e}")
            return ""

# Initialize global memory system
_memory_system = MemorySystem()

# Public API functions (maintaining compatibility with existing code)
def add_message(user_id: str, text: str, emotion: str, fruit: str, intensity: float, 
               context: Optional[Dict[str, Any]] = None) -> bool:
    """Add a message to user's memory"""
    return _memory_system.add_message(user_id, text, emotion, fruit, intensity, context)

def recall(user_id: str, query: str, k: int = 5) -> List[str]:
    """Recall relevant memories for a user"""
    return _memory_system.recall(user_id, query, k)

def get_user_insights(user_id: str) -> Dict[str, Any]:
    """Get insights about a user's patterns"""
    return _memory_system.get_user_insights(user_id)

def search_by_theme(user_id: str, theme: str, limit: int = 5) -> List[str]:
    """Search memories by theme"""
    return _memory_system.search_by_theme(user_id, theme, limit)

def get_conversation_context(user_id: str, current_message: str) -> str:
    """Get conversation context for current message"""
    return _memory_system.get_conversation_context(user_id, current_message)

# Test the system
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

# Example usage and testing
if __name__ == "__main__":
    # Test the memory system
    test_user = "test_user_123"
    
    print("\n🧪 Testing memory system...")
    
    # Add some test memories
    test_memories = [
        ("I'm feeling really anxious about my job interview tomorrow", "anxious", 0.8),
        ("Had a great day with my family at the park", "joy", 0.9),
        ("Work has been so stressful lately, my boss is demanding", "frustrated", 0.7),
        ("I'm proud of how I handled that difficult conversation", "proud", 0.8),
        ("Feeling overwhelmed with all the deadlines", "anxious", 0.6)
    ]
    
    for text, emotion, intensity in test_memories:
        result = add_message(test_user, text, emotion, f"Test {emotion}", intensity)
        print(f"📝 Added memory: {result}")
    
    # Test recall
    print("\n🔍 Testing recall...")
    memories = recall(test_user, "work stress", k=3)
    for i, memory in enumerate(memories, 1):
        print(f"  {i}. {memory}")
    
    # Test insights
    print("\n📊 Testing insights...")
    insights = get_user_insights(test_user)
    print(f"  Total memories: {insights.get('total_memories', 0)}")
    print(f"  Most common emotion: {insights.get('most_common_emotion', 'unknown')}")
    print(f"  Common themes: {insights.get('common_themes', [])}")
    
    # Test conversation context
    print("\n💬 Testing conversation context...")
    context = get_conversation_context(test_user, "I'm worried about tomorrow")
    print(f"Context: {context[:200]}..." if len(context) > 200 else f"Context: {context}")
    
    print("\n✅ Memory system test complete!")