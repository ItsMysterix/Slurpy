"""
memory.py – Qdrant Cloud for user memory (Alternative approach without indexes)
"""
import uuid, datetime, os
from typing import Dict, Any, List
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct, Filter, FieldCondition, MatchValue
from langchain_qdrant import Qdrant
from langchain_community.embeddings import HuggingFaceEmbeddings

# ── env & config ───────────────────────────────────────────────
load_dotenv()

# Cloud Qdrant for user memory
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API = os.getenv("QDRANT_API_KEY")
COLL_MEM = "user_memory"
EMBED_MODEL = "all-MiniLM-L6-v2"

print(f"🔍 Debug - QDRANT_URL: {QDRANT_URL}")
print(f"🔍 Debug - QDRANT_API present: {bool(QDRANT_API)}")

_embedder = HuggingFaceEmbeddings(model_name=EMBED_MODEL)

# Initialize client
if not QDRANT_URL or not QDRANT_API:
    print("⚠️ Missing QDRANT_URL or QDRANT_API_KEY - user memory will be disabled")
    _client = None
    _mem_vs = None
else:
    try:
        # Simple, direct connection
        _client = QdrantClient(
            url=QDRANT_URL,
            api_key=QDRANT_API,
            timeout=60
        )
        
        # Test connection
        collections = _client.get_collections().collections
        collection_names = [c.name for c in collections]
        print(f"✅ Connected to Qdrant! Collections: {collection_names}")
        
        # Create collection if needed
        if COLL_MEM not in collection_names:
            print(f"📦 Creating collection: {COLL_MEM}")
            dim = len(_embedder.embed_query("test"))
            _client.create_collection(
                collection_name=COLL_MEM,
                vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
            )
            print(f"✅ Created collection {COLL_MEM}")
        
        # Skip index creation entirely - use direct API instead
        print("🔧 Using direct API approach (no indexes needed)")
        _mem_vs = Qdrant(client=_client, collection_name=COLL_MEM, embeddings=_embedder)
        print("✅ Memory system ready!")
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        _client = None
        _mem_vs = None

# ── API using direct Qdrant calls ──────────────────────────────
def add_message(user_id: str, text: str, emotion: str, fruit: str, intensity: float) -> None:
    """Add a message using direct Qdrant API."""
    if _client is None:
        print("⚠️ User memory disabled - skipping message storage")
        return
        
    try:
        # Get embedding for the text
        vector = _embedder.embed_query(text)
        
        # Create point with payload
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "user_id": user_id,
                "text": text,
                "emotion": emotion,
                "fruit": fruit,
                "intensity": intensity,
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        )
        
        # Insert directly
        _client.upsert(
            collection_name=COLL_MEM,
            points=[point]
        )
        print(f"💾 Stored memory for user {user_id[:8]}...")
        
    except Exception as e:
        print(f"⚠️ Failed to add message: {e}")

def recall(user_id: str, query: str, k: int = 3) -> List[str]:
    """Recall using direct Qdrant API with scroll instead of filtering."""
    if _client is None:
        print("⚠️ User memory disabled - no recall available")
        return []
        
    try:
        # Strategy 1: Try direct search with filter (new Qdrant 1.15.0 syntax)
        query_vector = _embedder.embed_query(query)
        
        search_result = _client.search(
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
            limit=k
        )
        
        memories = [hit.payload.get("text", "") for hit in search_result if hit.payload and hit.payload.get("text")]
        if memories:
            print(f"🧠 Recalled {len(memories)} memories for user {user_id[:8]}...")
            return memories
        else:
            print(f"💭 No memories found for user {user_id[:8]}...")
            return []
            
    except Exception as e:
        print(f"⚠️ Direct search failed: {e}")
        
        # Strategy 2: Scroll through all points and filter manually
        try:
            print("🔄 Trying manual filtering approach...")
            
            # Get all points for this user by scrolling
            scroll_result = _client.scroll(
                collection_name=COLL_MEM,
                limit=1000,  # Adjust based on your needs
                with_payload=True,
                with_vectors=False
            )
            
            # Filter by user_id manually
            user_points = []
            for point in scroll_result[0]:
                if point.payload and point.payload.get("user_id") == user_id:
                    user_points.append(point)
            
            if not user_points:
                print(f"💭 No memories found for user {user_id[:8]}... (manual filter)")
                return []
            
            # Calculate similarity manually
            query_vector = _embedder.embed_query(query)
            similarities = []
            
            for point in user_points:
                if point.payload and point.payload.get("text"):
                    # Get point vector
                    point_data = _client.retrieve(
                        collection_name=COLL_MEM,
                        ids=[point.id],
                        with_vectors=True
                    )
                    
                    if point_data and len(point_data) > 0 and point_data[0].vector:
                        # Extract vector data properly for Qdrant 1.15.0
                        import numpy as np
                        
                        point_vector = point_data[0].vector
                        # Handle different vector formats in Qdrant 1.15.0
                        vector_data = None
                        
                        if isinstance(point_vector, dict):
                            # Named vectors format
                            if point_vector:
                                vector_data = list(point_vector.values())[0]
                        elif isinstance(point_vector, list):
                            # Direct list format
                            vector_data = point_vector
                        else:
                            # Other formats - try to convert to list
                            try:
                                vector_data = list(point_vector) if point_vector else None
                            except (TypeError, AttributeError):
                                vector_data = None
                        
                        if vector_data and isinstance(vector_data, (list, tuple)) and len(vector_data) > 0:
                            # Calculate cosine similarity
                            try:
                                similarity = np.dot(query_vector, vector_data) / (
                                    np.linalg.norm(query_vector) * np.linalg.norm(vector_data)
                                )
                                similarities.append((similarity, point.payload.get("text")))
                            except Exception as sim_error:
                                print(f"⚠️ Similarity calculation failed: {sim_error}")
                                # Just add with default similarity
                                similarities.append((0.5, point.payload.get("text")))
            
            # Sort by similarity and return top k
            similarities.sort(reverse=True)
            memories = [text for _, text in similarities[:k]]
            
            if memories:
                print(f"🧠 Recalled {len(memories)} memories for user {user_id[:8]}... (manual method)")
            return memories
            
        except Exception as manual_error:
            print(f"❌ Manual filtering also failed: {manual_error}")
            
            # Strategy 3: Just return some generic memories
            try:
                print("🔄 Falling back to generic search...")
                query_vector = _embedder.embed_query(query)
                
                search_result = _client.search(
                    collection_name=COLL_MEM,
                    query_vector=query_vector,
                    limit=1
                )
                
                generic_memories = [hit.payload.get("text", "") for hit in search_result if hit.payload and hit.payload.get("text")]
                if generic_memories:
                    print("📚 Using generic memory as fallback")
                return generic_memories
                
            except Exception as generic_error:
                print(f"❌ Even generic search failed: {generic_error}")
                return []

# Test the connection
if _client is not None:
    print("🎉 Slurpy memory system is ready!")
    
    # Test basic functionality
    try:
        collection_info = _client.get_collection(COLL_MEM)
        print(f"📊 Collection info: {collection_info.points_count} points stored")
    except Exception as e:
        print(f"ℹ️ Could not get collection info: {e}")
else:
    print("💤 Running without persistent memory")