"""
qdrant_cloud.py - Upload ed_index_full to Qdrant Cloud
Handles: Initial migration + Future dataset additions
"""
import os
import sqlite3
import argparse
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct, Record
from qdrant_client.http.models import SparseVector
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from dotenv import load_dotenv
import uuid
import shutil
import tempfile
from typing import List, Optional, Tuple, Union, Any

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API = os.getenv("QDRANT_API_KEY")
CLOUD_COLLECTION = "ed_chunks"

def get_vector_dimension(vector: Union[List[float], dict, Any]) -> int:
    """Safely get vector dimension from various vector formats"""
    try:
        if isinstance(vector, list):
            return len(vector)
        elif isinstance(vector, dict):
            # Handle named vectors
            first_key = list(vector.keys())[0]
            first_vector = vector[first_key]
            if isinstance(first_vector, list):
                return len(first_vector)
            elif hasattr(first_vector, 'values') and isinstance(first_vector.values, list):
                # Handle SparseVector
                return max(first_vector.indices) + 1 if first_vector.indices else 384
            else:
                return 384  # Default fallback
        else:
            return 384  # Default for unknown types
    except Exception:
        return 384  # Safe fallback

def convert_records_to_point_structs(records: List[Record]) -> List[PointStruct]:
    """Convert Qdrant Record objects to PointStruct objects for uploading"""
    points = []
    
    for record in records:
        try:
            # Handle different vector formats
            vector = record.vector
            if isinstance(vector, dict):
                # For named vectors, take the first one or convert appropriately
                first_key = list(vector.keys())[0]
                vector_data = vector[first_key]
                if isinstance(vector_data, list):
                    final_vector = vector_data
                elif hasattr(vector_data, 'values') and isinstance(vector_data.values, list):
                    # Handle SparseVector - convert to dense
                    dense_vector = [0.0] * 384  # Default dimension
                    for idx, val in zip(vector_data.indices, vector_data.values):
                        if idx < len(dense_vector):
                            dense_vector[idx] = val
                    final_vector = dense_vector
                else:
                    continue  # Skip this point if we can't handle the vector
            elif isinstance(vector, list):
                final_vector = vector
            else:
                continue  # Skip this point if we can't handle the vector
            
            point = PointStruct(
                id=record.id,
                vector=final_vector,
                payload=record.payload or {}
            )
            points.append(point)
            
        except Exception as e:
            print(f"⚠️ Skipping point {record.id}: {e}")
            continue
    
    return points

def debug_sqlite_structure() -> None:
    """Debug what's actually in the SQLite database"""
    db_path = 'ed_index_full/storage.sqlite'
    
    print(f"🔍 Examining SQLite database: {db_path}")
    print(f"📊 File size: {os.path.getsize(db_path) / 1024 / 1024:.1f} MB")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    
    print("\n📋 Tables in database:")
    for table in tables:
        table_name = table[0]
        try:
            cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
            count = cursor.fetchone()[0]
            print(f"  - {table_name}: {count} rows")
            
            # Show column structure
            cursor.execute(f"PRAGMA table_info(`{table_name}`)")
            columns = cursor.fetchall()
            print(f"    Columns: {[col[1] for col in columns]}")
            
            # Show sample data if exists
            if count > 0:
                cursor.execute(f"SELECT * FROM `{table_name}` LIMIT 1")
                sample = cursor.fetchone()
                print(f"    Sample: {str(sample)[:100]}...")
                
        except Exception as e:
            print(f"  - {table_name}: Error - {e}")
    
    conn.close()

def try_qdrant_connection() -> Tuple[Optional[QdrantClient], Optional[str], Optional[list]]:
    """Try different ways to connect to the local Qdrant"""
    
    print("\n🔧 Trying Qdrant connection methods...")
    
    # Method 1: Standard connection with timeout
    try:
        print("1️⃣ Trying standard connection with timeout...")
        client = QdrantClient(
            path="ed_index_full", 
            force_disable_check_same_thread=True,
            timeout=30
        )
        collections = client.get_collections()
        print(f"   ✅ Found {len(collections.collections)} collections")
        
        for c in collections.collections:
            try:
                info = client.get_collection(c.name)
                points_count = info.points_count or 0
                print(f"   - {c.name}: {points_count} points")
                
                # For newer Qdrant versions, try different scroll methods
                if points_count > 0 or True:  # Try even if count shows 0
                    try:
                        # Method A: Standard scroll
                        points, _ = client.scroll(
                            collection_name=c.name, 
                            limit=5, 
                            with_payload=True, 
                            with_vectors=True
                        )
                        if points:
                            print(f"   - Successfully retrieved {len(points)} sample points")
                            print(f"   - Sample ID: {points[0].id}")
                            print(f"   - Vector type: {type(points[0].vector)}")
                            vector_dim = get_vector_dimension(points[0].vector)
                            print(f"   - Vector dimension: {vector_dim}")
                            return client, c.name, points
                        
                    except Exception as scroll_e:
                        print(f"   - Standard scroll failed: {scroll_e}")
                        
                        # Method B: Try scroll with offset
                        try:
                            points, _ = client.scroll(
                                collection_name=c.name,
                                limit=5,
                                offset=None,
                                with_payload=True,
                                with_vectors=True
                            )
                            if points:
                                print(f"   - Offset scroll succeeded: {len(points)} points")
                                return client, c.name, points
                        except Exception as offset_e:
                            print(f"   - Offset scroll failed: {offset_e}")
                            
                        # Method C: Try without vectors first
                        try:
                            points, _ = client.scroll(
                                collection_name=c.name,
                                limit=5,
                                with_payload=True,
                                with_vectors=False
                            )
                            if points:
                                print(f"   - No-vector scroll succeeded: {len(points)} points")
                                # Now try to get vectors separately
                                try:
                                    points_with_vectors, _ = client.scroll(
                                        collection_name=c.name,
                                        limit=5,
                                        with_payload=True,
                                        with_vectors=True
                                    )
                                    return client, c.name, points_with_vectors if points_with_vectors else points
                                except:
                                    return client, c.name, points
                        except Exception as no_vec_e:
                            print(f"   - No-vector scroll failed: {no_vec_e}")
                        
                        # Method D: Try search instead of scroll
                        try:
                            # Create a dummy vector for search
                            dummy_vector = [0.0] * 384  # Standard embedding size
                            search_results = client.search(
                                collection_name=c.name,
                                query_vector=dummy_vector,
                                limit=5,
                                with_payload=True
                            )
                            if search_results:
                                print(f"   - Search method succeeded: {len(search_results)} points")
                                return client, c.name, search_results
                        except Exception as search_e:
                            print(f"   - Search method failed: {search_e}")
                        
            except Exception as e:
                print(f"   - Error with {c.name}: {e}")
                    
    except Exception as e:
        print(f"   ❌ Standard connection failed: {e}")
    
    # Method 2: Try with different client settings
    try:
        print("2️⃣ Trying connection with different settings...")
        client = QdrantClient(
            path="ed_index_full"
            # Remove force_disable_check_same_thread for newer versions
        )
        collections = client.get_collections()
        print(f"   ✅ Alternative connection found {len(collections.collections)} collections")
        
        # Check each collection again
        for c in collections.collections:
            try:
                info = client.get_collection(c.name)
                points_count = info.points_count or 0
                print(f"   - Found {c.name}: {points_count} points")
                
                # Try to get actual data
                points, _ = client.scroll(
                    collection_name=c.name,
                    limit=5,
                    with_payload=True,
                    with_vectors=True
                )
                if points:
                    print(f"   - Retrieved {len(points)} points successfully")
                    return client, c.name, points
                    
            except Exception as e:
                print(f"   - Error checking {c.name}: {e}")
        
    except Exception as e:
        print(f"   ❌ Alternative connection failed: {e}")
    
    print("\n💡 If all methods failed, the database might need rebuilding")
    print("   Try re-running your document ingestion pipeline")
    
    return None, None, None

def replace_sqlite_database(new_sqlite_path: str, backup_old: bool = True) -> bool:
    """Replace existing ed_index_full with new trained SQLite database"""
    
    print(f"🔄 Replacing SQLite database with: {new_sqlite_path}")
    
    if not os.path.exists(new_sqlite_path):
        print(f"❌ New SQLite file not found: {new_sqlite_path}")
        return False
    
    old_sqlite = "ed_index_full/storage.sqlite"
    
    # Check sizes
    if os.path.exists(old_sqlite):
        old_size = os.path.getsize(old_sqlite) / 1024 / 1024
        new_size = os.path.getsize(new_sqlite_path) / 1024 / 1024
        print(f"📊 Old database: {old_size:.1f} MB")
        print(f"📊 New database: {new_size:.1f} MB")
        
        if backup_old:
            backup_path = f"ed_index_full_backup_{int(old_size)}MB.sqlite"
            print(f"💾 Backing up old database to: {backup_path}")
            shutil.copy2(old_sqlite, backup_path)
    
    # Replace the SQLite file
    shutil.copy2(new_sqlite_path, old_sqlite)
    print(f"✅ Database replaced successfully")
    
    # Verify new database
    try:
        client = QdrantClient(path="ed_index_full", force_disable_check_same_thread=True)
        collections = client.get_collections()
        
        total_points = 0
        for c in collections.collections:
            info = client.get_collection(c.name)
            # Fix for the type error - handle None case
            points_count = info.points_count or 0
            print(f"📋 Collection {c.name}: {points_count} points")
            total_points += points_count
        
        print(f"🎉 New database loaded with {total_points} total points")
        return True
        
    except Exception as e:
        print(f"❌ Error verifying new database: {e}")
        return False

def sync_latest_to_cloud(replace_existing: bool = False) -> None:
    """Upload latest SQLite database to cloud, optionally replacing existing data"""
    
    print("🔄 SYNCING LATEST DATABASE TO CLOUD")
    
    if replace_existing:
        print("⚠️ This will REPLACE all existing data in cloud!")
        confirm = input("Are you sure? (yes/no): ")
        if confirm.lower() != 'yes':
            print("❌ Cancelled")
            return
    
    # Connect to cloud
    try:
        cloud_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API)
        print("✅ Connected to cloud")
    except Exception as e:
        print(f"❌ Failed to connect: {e}")
        return
    
    # If replacing, delete existing collection
    if replace_existing:
        try:
            collections = cloud_client.get_collections().collections
            if CLOUD_COLLECTION in [c.name for c in collections]:
                print(f"🗑️ Deleting existing collection: {CLOUD_COLLECTION}")
                cloud_client.delete_collection(CLOUD_COLLECTION)
        except Exception as e:
            print(f"⚠️ Error deleting collection: {e}")
    
    # Upload current database
    upload_to_cloud()

def merge_databases(new_sqlite_path: str) -> None:
    """Merge new SQLite database with existing cloud data"""
    
    print(f"🔄 MERGING NEW DATABASE: {new_sqlite_path}")
    
    if not os.path.exists(new_sqlite_path):
        print(f"❌ File not found: {new_sqlite_path}")
        return
    
    # Create temporary directory for new database
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_db_path = os.path.join(temp_dir, "temp_qdrant")
        
        # Copy new database to temp location
        shutil.copytree(os.path.dirname(new_sqlite_path), temp_db_path)
        
        # Connect to new database
        try:
            new_client = QdrantClient(path=temp_db_path, force_disable_check_same_thread=True)
            collections = new_client.get_collections()
            
            print("📋 New database collections:")
            for c in collections.collections:
                info = new_client.get_collection(c.name)
                points_count = info.points_count or 0
                print(f"  - {c.name}: {points_count} points")
            
            # Upload each collection to cloud
            cloud_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API)
            
            # Ensure cloud collection exists
            cloud_collections = cloud_client.get_collections().collections
            if CLOUD_COLLECTION not in [c.name for c in cloud_collections]:
                print(f"📦 Creating cloud collection: {CLOUD_COLLECTION}")
                cloud_client.create_collection(
                    collection_name=CLOUD_COLLECTION,
                    vectors_config=VectorParams(size=384, distance=Distance.COSINE)
                )
            
            for c in collections.collections:
                collection_name = c.name
                info = new_client.get_collection(collection_name)
                points_count = info.points_count or 0
                
                if points_count > 0:
                    print(f"⬆️ Uploading {collection_name} ({points_count} points)...")
                    
                    # Get all points
                    points, _ = new_client.scroll(
                        collection_name=collection_name,
                        limit=10000,
                        with_payload=True,
                        with_vectors=True
                    )
                    
                    # Upload to cloud
                    batch_size = 100
                    for i in range(0, len(points), batch_size):
                        batch_records = points[i:i + batch_size]
                        batch_points = convert_records_to_point_structs(batch_records)
                        if batch_points:  # Only upload if we have valid points
                            cloud_client.upsert(collection_name=CLOUD_COLLECTION, points=batch_points)
                        if i % 500 == 0:  # Progress every 5 batches
                            print(f"   Uploaded {i + len(batch_records)}/{len(points)} points...")
                    
                    print(f"✅ Completed {collection_name}")
            
            # Verify final count
            final_info = cloud_client.get_collection(CLOUD_COLLECTION)
            final_count = final_info.points_count or 0
            print(f"🎉 Merge complete! Cloud now has {final_count} points")
            
        except Exception as e:
            print(f"❌ Error during merge: {e}")

def add_new_documents(file_paths: List[str], source_name: Optional[str] = None) -> None:
    """Add new documents directly to Qdrant Cloud"""
    
    print(f"📚 Adding new documents to cloud...")
    print(f"Files: {file_paths}")
    
    # Connect to cloud
    try:
        cloud_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API)
        embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        print("✅ Connected to cloud")
    except Exception as e:
        print(f"❌ Failed to connect: {e}")
        return
    
    # Ensure collection exists
    collections = cloud_client.get_collections().collections
    if CLOUD_COLLECTION not in [c.name for c in collections]:
        print(f"📦 Creating collection: {CLOUD_COLLECTION}")
        cloud_client.create_collection(
            collection_name=CLOUD_COLLECTION,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE)  # all-MiniLM-L6-v2 dimension
        )
    
    # Process each file
    all_docs = []
    for file_path in file_paths:
        print(f"📄 Processing: {file_path}")
        
        try:
            # Load document
            if file_path.endswith('.pdf'):
                loader = PyPDFLoader(file_path)
            else:
                loader = TextLoader(file_path)
            
            documents = loader.load()
            
            # Split into chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200
            )
            chunks = text_splitter.split_documents(documents)
            
            # Add metadata
            for chunk in chunks:
                chunk.metadata["source"] = source_name or os.path.basename(file_path)
                chunk.metadata["file_path"] = file_path
            
            all_docs.extend(chunks)
            print(f"   Created {len(chunks)} chunks")
            
        except Exception as e:
            print(f"❌ Error processing {file_path}: {e}")
            continue
    
    if not all_docs:
        print("❌ No documents processed")
        return
    
    print(f"📊 Total chunks to upload: {len(all_docs)}")
    
    # Create embeddings and upload
    print("🤖 Creating embeddings...")
    texts = [doc.page_content for doc in all_docs]
    embeddings = embedder.embed_documents(texts)
    
    # Create points
    points = []
    for i, (doc, embedding) in enumerate(zip(all_docs, embeddings)):
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "text": doc.page_content,
                "source": doc.metadata.get("source", "unknown"),
                "file_path": doc.metadata.get("file_path", "unknown")
            }
        )
        points.append(point)
    
    # Upload in batches
    print("⬆️ Uploading to cloud...")
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i:i + batch_size]
        cloud_client.upsert(collection_name=CLOUD_COLLECTION, points=batch)
        print(f"✅ Uploaded batch {i//batch_size + 1}/{(len(points)-1)//batch_size + 1}")
    
    # Verify
    final_info = cloud_client.get_collection(CLOUD_COLLECTION)
    final_count = final_info.points_count or 0
    print(f"🎉 Success! Cloud now has {final_count} total points")
    print(f"📈 Added {len(points)} new points from your datasets")

def upload_to_cloud() -> None:
    """Main upload function with comprehensive debugging"""
    
    print("🚀 QDRANT CLOUD UPLOADER")
    print("=" * 50)
    
    # Check prerequisites
    if not os.path.exists("ed_index_full"):
        print("❌ ed_index_full directory not found!")
        return
    
    if not os.path.exists("ed_index_full/storage.sqlite"):
        print("❌ storage.sqlite not found!")
        return
    
    # Check for newer directory structure
    if os.path.exists("ed_index_full/collection"):
        print("✅ Found newer Qdrant directory structure")
        collections_found = []
        for item in os.listdir("ed_index_full/collection"):
            if os.path.isdir(os.path.join("ed_index_full/collection", item)) and not item.startswith('.'):
                collections_found.append(item)
        print(f"📁 Collections found: {collections_found}")
    else:
        print("⚠️ No collection directory found - database might be empty")
    
    print("✅ Prerequisites check passed")
    
    # Step 1: Debug SQLite structure
    debug_sqlite_structure()
    
    # Step 2: Try Qdrant connections
    client, collection_name, sample_points = try_qdrant_connection()
    
    if not client:
        print("\n❌ Could not connect to local Qdrant database")
        print("💡 This might be a version compatibility issue")
        return
    
    if not collection_name:
        print("\n⚠️ No collections with data found")
        return
    
    print(f"\n🎯 Using collection: {collection_name}")
    
    # Step 3: Connect to cloud
    try:
        print("\n☁️ Connecting to Qdrant Cloud...")
        cloud_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API)
        
        # Test connection
        cloud_collections = cloud_client.get_collections().collections
        print(f"✅ Connected! Found {len(cloud_collections)} existing collections")
        
    except Exception as e:
        print(f"❌ Failed to connect to cloud: {e}")
        print("💡 Check your QDRANT_URL and QDRANT_API_KEY in .env")
        return
    
    # Step 4: Get all data
    print(f"\n📥 Fetching all data from {collection_name}...")
    try:
        all_points, _ = client.scroll(
            collection_name=collection_name,
            limit=10000,  # Adjust if you have more
            with_payload=True,
            with_vectors=True
        )
        print(f"📊 Retrieved {len(all_points)} total points")
        
    except Exception as e:
        print(f"❌ Error fetching data: {e}")
        return
    
    if len(all_points) == 0:
        print("❌ No points retrieved - database might be empty")
        return
    
    # Step 5: Analyze data structure
    sample = all_points[0]
    print(f"\n🔍 Data structure analysis:")
    print(f"   - Sample ID: {sample.id}")
    print(f"   - Vector type: {type(sample.vector)}")
    print(f"   - Payload keys: {list(sample.payload.keys()) if sample.payload else 'None'}")
    
    # Determine vector dimension
    vector_dim = get_vector_dimension(sample.vector)
    print(f"   - Vector dimension: {vector_dim}")
    
    # Step 6: Create cloud collection
    cloud_names = [c.name for c in cloud_client.get_collections().collections]
    
    if CLOUD_COLLECTION not in cloud_names:
        print(f"\n📦 Creating cloud collection: {CLOUD_COLLECTION}")
        try:
            cloud_client.create_collection(
                collection_name=CLOUD_COLLECTION,
                vectors_config=VectorParams(size=vector_dim, distance=Distance.COSINE)
            )
            print(f"✅ Created collection with {vector_dim} dimensions")
        except Exception as e:
            print(f"❌ Error creating collection: {e}")
            return
    else:
        cloud_info = cloud_client.get_collection(CLOUD_COLLECTION)
        cloud_points_count = cloud_info.points_count or 0
        print(f"✅ Cloud collection exists with {cloud_points_count} points")
    
    # Step 7: Upload data
    print(f"\n⬆️ Uploading {len(all_points)} points to cloud...")
    
    try:
        batch_size = 100
        total_batches = (len(all_points) - 1) // batch_size + 1
        
        for i in range(0, len(all_points), batch_size):
            batch_records = all_points[i:i + batch_size]
            batch_points = convert_records_to_point_structs(batch_records)
            
            if batch_points:  # Only upload if we have valid points
                cloud_client.upsert(collection_name=CLOUD_COLLECTION, points=batch_points)
                batch_num = i // batch_size + 1
                print(f"✅ Uploaded batch {batch_num}/{total_batches} ({len(batch_points)} points)")
            else:
                print(f"⚠️ Skipped batch {i // batch_size + 1} - no valid points")
            
    except Exception as e:
        print(f"❌ Error during upload: {e}")
        return
    
    # Step 8: Verify upload
    print("\n🎉 Verifying upload...")
    try:
        final_info = cloud_client.get_collection(CLOUD_COLLECTION)
        final_points_count = final_info.points_count or 0
        print(f"✅ Upload complete! Cloud now has {final_points_count} points")
        
        # Test search
        embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        test_vector = embedder.embed_query("test search")
        
        test_results = cloud_client.search(
            collection_name=CLOUD_COLLECTION,
            query_vector=test_vector,
            limit=3
        )
        print(f"✅ Search test successful - found {len(test_results)} results")
        
        print("\n🚀 SUCCESS! Your brain is now in the cloud!")
        
    except Exception as e:
        print(f"⚠️ Upload completed but verification failed: {e}")

def main() -> None:
    """Main entry point with argument parsing"""
    parser = argparse.ArgumentParser(description="Qdrant Cloud Manager")
    parser.add_argument('--migrate', action='store_true', help='Migrate existing ed_index_full to cloud')
    parser.add_argument('--add', nargs='+', help='Add new documents to cloud')
    parser.add_argument('--source', help='Source name for new documents')
    parser.add_argument('--replace-sqlite', help='Replace local SQLite with new trained database')
    parser.add_argument('--sync-latest', action='store_true', help='Upload latest local database to cloud')
    parser.add_argument('--replace-cloud', action='store_true', help='Replace ALL cloud data with local database')
    parser.add_argument('--merge-sqlite', help='Merge new SQLite database with existing cloud data')
    
    args = parser.parse_args()
    
    if args.migrate:
        print("🔄 MIGRATING EXISTING DATABASE TO CLOUD")
        upload_to_cloud()
        
    elif args.add:
        print("📚 ADDING NEW DOCUMENTS TO CLOUD")
        add_new_documents(args.add, args.source)
        
    elif args.replace_sqlite:
        print("🔄 REPLACING LOCAL SQLITE DATABASE")
        if replace_sqlite_database(args.replace_sqlite):
            print("✅ Database replaced. Run --sync-latest to upload to cloud")
        
    elif args.sync_latest:
        print("🔄 SYNCING LATEST DATABASE TO CLOUD")
        sync_latest_to_cloud(replace_existing=args.replace_cloud)
        
    elif args.merge_sqlite:
        print("🔄 MERGING NEW DATABASE WITH CLOUD")
        merge_databases(args.merge_sqlite)
        
    else:
        print("🚀 QDRANT CLOUD MANAGER")
        print("Usage:")
        print("\n📤 Initial Setup:")
        print("  python qdrant_cloud.py --migrate                    # Upload existing ed_index_full")
        
        print("\n📚 Adding New Documents:")
        print("  python qdrant_cloud.py --add file1.pdf file2.txt    # Add new documents")
        print("  python qdrant_cloud.py --add data.pdf --source 'Dataset v2'")
        
        print("\n🔄 Database Replacement (when you retrain):")
        print("  python qdrant_cloud.py --replace-sqlite new_storage.sqlite")
        print("  python qdrant_cloud.py --sync-latest                # Add to existing cloud data")
        print("  python qdrant_cloud.py --sync-latest --replace-cloud # Replace ALL cloud data")
        
        print("\n🔀 Database Merging:")
        print("  python qdrant_cloud.py --merge-sqlite new_database/storage.sqlite")
        
        print("\nDefault: Running migration...")
        upload_to_cloud()

if __name__ == "__main__":
    main()