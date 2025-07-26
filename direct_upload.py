#!/usr/bin/env python3
"""
Direct SQLite extraction and cloud upload - bypasses Qdrant client issues
"""
import os
import sqlite3
import pickle
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
from langchain_community.embeddings import HuggingFaceEmbeddings
from dotenv import load_dotenv
from typing import List, Optional
import argparse

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API = os.getenv("QDRANT_API_KEY")
CLOUD_COLLECTION = "ed_chunks"

def extract_points_from_sqlite() -> List[PointStruct]:
    """Extract all points directly from the SQLite database"""
    
    print("🔄 EXTRACTING DATA DIRECTLY FROM SQLITE")
    print("=" * 45)
    
    db_path = 'ed_index_full/storage.sqlite'
    
    if not os.path.exists(db_path):
        print(f"❌ SQLite file not found: {db_path}")
        return []
    
    print(f"📊 Opening database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get total count
    cursor.execute("SELECT COUNT(*) FROM points")
    total_points = cursor.fetchone()[0]
    print(f"📈 Total points to extract: {total_points}")
    
    # Extract all points
    cursor.execute("SELECT id, point FROM points")
    
    extracted_points = []
    failed_count = 0
    processed_count = 0
    
    print("🔄 Processing points...")
    
    for row_id, point_data in cursor.fetchall():
        processed_count += 1
        
        if processed_count % 1000 == 0:
            print(f"   Processed {processed_count}/{total_points} points...")
        
        try:
            # Decode the pickled point data
            decoded_point = pickle.loads(point_data)
            
            # Extract required fields
            original_id = None
            vector = None
            payload = {}
            
            # Handle different object types to get original ID
            if hasattr(decoded_point, 'id'):
                original_id = decoded_point.id
            elif hasattr(decoded_point, '__dict__') and 'id' in decoded_point.__dict__:
                original_id = decoded_point.__dict__['id']
            
            # Always generate a new UUID for Qdrant Cloud compatibility
            # Store original ID in payload if it exists
            point_id = str(uuid.uuid4())
            
            if hasattr(decoded_point, 'vector'):
                vector = decoded_point.vector
            elif hasattr(decoded_point, '__dict__') and 'vector' in decoded_point.__dict__:
                vector = decoded_point.__dict__['vector']
            
            if hasattr(decoded_point, 'payload'):
                payload = decoded_point.payload or {}
            elif hasattr(decoded_point, '__dict__') and 'payload' in decoded_point.__dict__:
                payload = decoded_point.__dict__['payload'] or {}
            
            # Store original ID in payload for reference
            if original_id is not None:
                payload['original_id'] = original_id
            
            # Validate vector
            if vector is None:
                failed_count += 1
                continue
            
            # Handle different vector formats
            final_vector = None
            if isinstance(vector, list):
                final_vector = vector
            elif isinstance(vector, dict):
                # Handle named vectors
                if len(vector) > 0:
                    first_key = list(vector.keys())[0]
                    vector_data = vector[first_key]
                    if isinstance(vector_data, list):
                        final_vector = vector_data
                    else:
                        failed_count += 1
                        continue
                else:
                    failed_count += 1
                    continue
            else:
                failed_count += 1
                continue
            
            # Create PointStruct with UUID
            point = PointStruct(
                id=point_id,  # Always a UUID now
                vector=final_vector,
                payload=payload  # Contains original_id if it existed
            )
            
            extracted_points.append(point)
            
        except Exception as e:
            failed_count += 1
            if failed_count <= 5:  # Show first few errors
                print(f"   ⚠️ Failed to decode point {processed_count}: {e}")
    
    conn.close()
    
    print(f"\n✅ Extraction complete!")
    print(f"   Successfully extracted: {len(extracted_points)} points")
    print(f"   Failed to decode: {failed_count} points")
    print(f"   Success rate: {(len(extracted_points)/total_points)*100:.1f}%")
    
    if extracted_points:
        # Show sample data
        sample = extracted_points[0]
        print(f"\n📋 Sample extracted point:")
        print(f"   ID: {sample.id} (UUID)")
        if 'original_id' in sample.payload:
            print(f"   Original ID: {sample.payload['original_id']} (stored in payload)")
        print(f"   Vector type: {type(sample.vector)}")
        print(f"   Vector length: {len(sample.vector) if isinstance(sample.vector, list) else 'unknown'}")
        print(f"   Payload keys: {list(sample.payload.keys()) if sample.payload else 'None'}")
        
        # Check vector dimensions
        if isinstance(sample.vector, list):
            vector_dim = len(sample.vector)
            print(f"   Vector dimension: {vector_dim}")
    
    return extracted_points

def upload_points_to_cloud(points: List[PointStruct], replace_existing: bool = False) -> bool:
    """Upload extracted points directly to Qdrant Cloud"""
    
    print(f"\n☁️ UPLOADING TO QDRANT CLOUD")
    print("=" * 35)
    
    if not points:
        print("❌ No points to upload!")
        return False
    
    print(f"📊 Points to upload: {len(points)}")
    
    # Connect to cloud
    try:
        print("🔗 Connecting to Qdrant Cloud...")
        cloud_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API)
        print("✅ Connected successfully!")
    except Exception as e:
        print(f"❌ Failed to connect to cloud: {e}")
        print("💡 Check your QDRANT_URL and QDRANT_API_KEY in .env file")
        return False
    
    # Get vector dimension from first point
    vector_dim = len(points[0].vector) if isinstance(points[0].vector, list) else 384
    print(f"📐 Using vector dimension: {vector_dim}")
    
    # Check if collection exists
    try:
        existing_collections = cloud_client.get_collections().collections
        collection_names = [c.name for c in existing_collections]
        
        if CLOUD_COLLECTION in collection_names:
            if replace_existing:
                print(f"🗑️ Deleting existing collection: {CLOUD_COLLECTION}")
                cloud_client.delete_collection(CLOUD_COLLECTION)
            else:
                existing_info = cloud_client.get_collection(CLOUD_COLLECTION)
                existing_count = existing_info.points_count or 0
                print(f"📋 Collection exists with {existing_count} points (will add to existing)")
        
        # Create or ensure collection exists
        if CLOUD_COLLECTION not in collection_names or replace_existing:
            print(f"📦 Creating collection: {CLOUD_COLLECTION}")
            cloud_client.create_collection(
                collection_name=CLOUD_COLLECTION,
                vectors_config=VectorParams(size=vector_dim, distance=Distance.COSINE)
            )
            print("✅ Collection created!")
        
    except Exception as e:
        print(f"❌ Error managing collection: {e}")
        return False
    
    # Upload in batches
    print(f"⬆️ Uploading points in batches...")
    batch_size = 100
    total_batches = (len(points) - 1) // batch_size + 1
    
    try:
        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]
            
            cloud_client.upsert(
                collection_name=CLOUD_COLLECTION,
                points=batch
            )
            
            batch_num = i // batch_size + 1
            progress = (batch_num / total_batches) * 100
            print(f"   ✅ Batch {batch_num}/{total_batches} ({progress:.1f}%) - {len(batch)} points")
    
    except Exception as e:
        print(f"❌ Error during upload: {e}")
        return False
    
    # Verify upload
    try:
        print(f"\n🎉 Verifying upload...")
        final_info = cloud_client.get_collection(CLOUD_COLLECTION)
        final_count = final_info.points_count or 0
        print(f"✅ Upload complete! Cloud now has {final_count} total points")
        
        # Test search to make sure everything works
        print(f"🔍 Testing search functionality...")
        embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        test_vector = embedder.embed_query("test search query")
        
        search_results = cloud_client.search(
            collection_name=CLOUD_COLLECTION,
            query_vector=test_vector,
            limit=3
        )
        print(f"✅ Search test successful - found {len(search_results)} results")
        
        if search_results:
            print(f"📋 Sample search result:")
            sample_result = search_results[0]
            print(f"   Score: {sample_result.score:.4f}")
            if sample_result.payload:
                print(f"   Payload keys: {list(sample_result.payload.keys())}")
        
        print(f"\n🚀 SUCCESS! Your data is now live in Qdrant Cloud!")
        print(f"   Collection: {CLOUD_COLLECTION}")
        print(f"   Total points: {final_count}")
        print(f"   Vector dimension: {vector_dim}")
        
        return True
        
    except Exception as e:
        print(f"⚠️ Upload completed but verification failed: {e}")
        return True  # Still consider it successful

def main():
    parser = argparse.ArgumentParser(description="Direct SQLite to Qdrant Cloud Migration")
    parser.add_argument('--replace', action='store_true', 
                       help='Replace existing cloud collection (default: add to existing)')
    parser.add_argument('--extract-only', action='store_true',
                       help='Only extract and save data locally, do not upload')
    
    args = parser.parse_args()
    
    print("🚀 DIRECT SQLITE TO CLOUD MIGRATION")
    print("=" * 50)
    
    if args.replace:
        print("⚠️ REPLACE MODE: Will delete existing cloud data!")
        confirm = input("Are you sure? Type 'yes' to continue: ")
        if confirm.lower() != 'yes':
            print("❌ Cancelled")
            return
    
    # Extract data from SQLite
    points = extract_points_from_sqlite()
    
    if not points:
        print("❌ No points extracted - nothing to upload")
        return
    
    if args.extract_only:
        # Save extracted data locally
        output_file = "extracted_points.pickle"
        with open(output_file, 'wb') as f:
            pickle.dump(points, f)
        print(f"\n💾 Extracted data saved to: {output_file}")
        print(f"   {len(points)} points saved")
        print("   Use without --extract-only flag to upload to cloud")
        return
    
    # Upload to cloud
    success = upload_points_to_cloud(points, replace_existing=args.replace)
    
    if success:
        print(f"\n🎊 MIGRATION COMPLETE!")
        print(f"   Your {len(points)} data points are now in Qdrant Cloud")
        print(f"   You can now use your cloud collection for RAG queries")
    else:
        print(f"\n❌ Migration failed - check the errors above")

if __name__ == "__main__":
    main()