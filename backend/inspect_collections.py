#!/usr/bin/env python3
"""
Quick inspection of Qdrant collection directories
"""
import os

def inspect_collections():
    """Check what's inside the collection directories"""
    
    print("🔍 INSPECTING QDRANT COLLECTIONS")
    print("=" * 40)
    
    collections_dir = "ed_index_full/collection"
    
    if not os.path.exists(collections_dir):
        print("❌ Collection directory not found!")
        return
    
    print(f"📁 Inspecting: {collections_dir}")
    
    for collection_name in os.listdir(collections_dir):
        collection_path = os.path.join(collections_dir, collection_name)
        
        if os.path.isdir(collection_path) and not collection_name.startswith('.'):
            print(f"\n📂 Collection: {collection_name}")
            
            if os.listdir(collection_path):
                print("   Contents:")
                for item in os.listdir(collection_path):
                    item_path = os.path.join(collection_path, item)
                    if os.path.isfile(item_path):
                        size = os.path.getsize(item_path) / (1024 * 1024)
                        print(f"   📄 {item} ({size:.2f} MB)")
                    elif os.path.isdir(item_path):
                        # Count files in subdirectory
                        try:
                            subfiles = len([f for f in os.listdir(item_path) if os.path.isfile(os.path.join(item_path, f))])
                            print(f"   📁 {item}/ ({subfiles} files)")
                        except:
                            print(f"   📁 {item}/ (cannot read)")
            else:
                print("   ❌ EMPTY DIRECTORY")
    
    # Also check the main storage.sqlite
    storage_path = "ed_index_full/storage.sqlite"
    if os.path.exists(storage_path):
        size = os.path.getsize(storage_path) / (1024 * 1024)
        print(f"\n📊 storage.sqlite: {size:.1f} MB")
        
        # Try to peek into SQLite
        try:
            import sqlite3
            conn = sqlite3.connect(storage_path)
            cursor = conn.cursor()
            
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            print(f"   Tables: {tables}")
            
            for table in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
                    count = cursor.fetchone()[0]
                    print(f"   - {table}: {count} rows")
                except:
                    print(f"   - {table}: cannot count")
            
            conn.close()
            
        except Exception as e:
            print(f"   ❌ SQLite inspection failed: {e}")
    
    print(f"\n🎯 ANALYSIS:")
    
    # Check if collections are empty
    empty_collections = []
    for collection_name in os.listdir(collections_dir):
        collection_path = os.path.join(collections_dir, collection_name)
        if os.path.isdir(collection_path) and not collection_name.startswith('.'):
            if not os.listdir(collection_path):
                empty_collections.append(collection_name)
    
    if empty_collections:
        print(f"❌ Empty collections found: {empty_collections}")
        print("💡 This explains why Qdrant shows 0 points!")
        print("💡 The data is in storage.sqlite but not properly indexed")
        
        print(f"\n🛠️ SOLUTIONS:")
        print("1. Re-run your document ingestion pipeline")
        print("2. The indexing process might have been interrupted")
        print("3. Try extracting data directly from storage.sqlite")
        
    else:
        print("✅ Collections contain files - data should be accessible")

if __name__ == "__main__":
    inspect_collections()