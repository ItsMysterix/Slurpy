# backend/qdrant_cloud.py
"""
Qdrant Cloud Manager
- Upload / sync local embedded Qdrant (slurpy_qdrant_index OR legacy ed_index_full) to Qdrant Cloud
- Add new docs directly to cloud
- Merge or replace datasets

Design (unchanged, just hardened):
- Keep legacy fallbacks (multiple scroll/search strategies) for resilience
- Robust primitives:
  * paginate_scroll(...) to read all points safely
  * convert_records_to_point_structs(...) to normalize vectors/IDs
  * _upsert_with_retries(...) for reliable uploads
  * _ensure_cloud_collection(...) to create/validate target collection
- NEW:
  * connect_cloud() with env validation
  * LOCAL_QDRANT_PATH autodetects slurpy_qdrant_index first, then ed_index_full
  * CLOUD_COLLECTION is env-overridable, defaults to slurpy_chunks
"""

from __future__ import annotations

import os
import uuid
import time
import shutil
import sqlite3
import argparse
import tempfile
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union
from pathlib import Path

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct, Record
from qdrant_client.http.models import SparseVector
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter

load_dotenv()

# ===================== Env & Paths =====================

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API = os.getenv("QDRANT_API_KEY")

# Default cloud collection now favors your live index name
CLOUD_COLLECTION = os.getenv("QDRANT_COLLECTION", "slurpy_chunks")

# Prefer slurpy_qdrant_index (embedded Qdrant on disk), fall back to ed_index_full
def _auto_local_path() -> str:
    cwd = Path.cwd()
    cand = [
        cwd / "slurpy_qdrant_index",
        cwd / "ed_index_full",  # legacy
    ]
    for p in cand:
        if p.exists():
            return str(p)
    # last resort: keep old default for compat
    return "ed_index_full"

LOCAL_QDRANT_PATH = os.getenv("LOCAL_QDRANT_PATH", _auto_local_path())

def _is_qdrant_embedded(path: str) -> bool:
    p = Path(path)
    return (p / "meta.json").exists() and (p / "collection").exists()

def _is_chroma_dir(path: str) -> bool:
    p = Path(path)
    return (p / "storage.sqlite").exists()

# Tunables (unchanged)
BATCH_SIZE = 128
MAX_RETRIES = 5
BASE_BACKOFF = 0.8
DEFAULT_DIM = 384  # all-MiniLM-L6-v2

# ===================== Logging =====================

def _log(msg: str) -> None:
    print(msg, flush=True)

# ===================== New: Cloud connector =====================

def connect_cloud() -> Optional[QdrantClient]:
    """Robust connection helper for Qdrant Cloud."""
    if not QDRANT_URL or not QDRANT_API:
        _log("❌ Missing QDRANT_URL or QDRANT_API_KEY in environment")
        return None
    if not QDRANT_URL.startswith("http"):
        _log(f"❌ Invalid QDRANT_URL '{QDRANT_URL}' — must include http/https")
        return None
    try:
        client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API, timeout=60)
        cols = client.get_collections()
        _log(f"✅ Connected to cloud, {len(cols.collections)} collections available")
        return client
    except Exception as e:
        _log(f"❌ Failed to connect to Qdrant Cloud at {QDRANT_URL}: {e}")
        return None

# ===================== Vector helpers (unchanged) =====================

def get_vector_dimension(vector: Union[List[float], Dict[str, Any], Any]) -> int:
    try:
        if isinstance(vector, list):
            return len(vector)
        if isinstance(vector, dict):
            if not vector:
                return DEFAULT_DIM
            first_key = next(iter(vector))
            inner = vector[first_key]
            if isinstance(inner, list):
                return len(inner)
            if isinstance(inner, SparseVector):
                return max(inner.indices) + 1 if getattr(inner, "indices", None) else DEFAULT_DIM
        if isinstance(vector, SparseVector):
            return max(vector.indices) + 1 if getattr(vector, "indices", None) else DEFAULT_DIM
    except Exception:
        pass
    return DEFAULT_DIM

def _as_dense(v: Union[List[float], Dict[str, Any], SparseVector, Any]) -> Optional[List[float]]:
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        if not v:
            return None
        first_key = next(iter(v))
        inner = v[first_key]
        return _as_dense(inner)
    if isinstance(v, SparseVector):
        dim = max(v.indices) + 1 if getattr(v, "indices", None) else DEFAULT_DIM
        dense = [0.0] * dim
        for idx, val in zip(v.indices, v.values):
            if 0 <= idx < dim:
                dense[idx] = float(val)
        return dense
    return None

def convert_records_to_point_structs(records: Iterable[Record]) -> List[PointStruct]:
    out: List[PointStruct] = []
    for r in records:
        try:
            rid = getattr(r, "id", None)
            vec = getattr(r, "vector", None)
            payload = getattr(r, "payload", None) or {}

            dense = _as_dense(vec)
            if dense is None:
                dense = _as_dense({"v": vec})
            if dense is None:
                _log(f"⚠️ Skipping point (no convertible vector) id={rid}")
                continue

            sid = str(rid) if rid is not None else str(uuid.uuid4())
            out.append(PointStruct(id=sid, vector=dense, payload=payload))
        except Exception as e:
            _log(f"⚠️ Skipping record due to error: {e}")
            continue
    return out

def _upsert_with_retries(client: QdrantClient, collection: str, points: List[PointStruct]) -> None:
    attempt = 0
    while True:
        try:
            client.upsert(collection_name=collection, points=points, wait=True)
            return
        except Exception as e:
            attempt += 1
            if attempt > MAX_RETRIES:
                raise
            sleep_s = BASE_BACKOFF * (2 ** (attempt - 1))
            _log(f"⏳ Upsert retry {attempt}/{MAX_RETRIES} in {sleep_s:.1f}s: {e}")
            time.sleep(sleep_s)

def _ensure_cloud_collection(cloud: QdrantClient, name: str, dim: int) -> None:
    names = [c.name for c in cloud.get_collections().collections]
    if name not in names:
        _log(f"📦 Creating cloud collection: {name} (dim={dim})")
        cloud.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )
        return
    _log(f"✅ Cloud collection exists: {name}")

def paginate_scroll(
    client: QdrantClient,
    collection: str,
    batch: int = 2048,
    with_vectors: bool = True,
    with_payload: bool = True,
) -> Iterable[List[Record]]:
    next_offset = None
    while True:
        points, next_offset = client.scroll(
            collection_name=collection,
            limit=batch,
            with_vectors=with_vectors,
            with_payload=with_payload,
            offset=next_offset,
        )
        if not points:
            break
        yield points
        if not next_offset:
            break

# ===================== Debug helpers (kept; guard for Chroma) =====================

def debug_sqlite_structure() -> None:
    """
    Legacy helper for Chroma-style SQLite (ed_index_full/storage.sqlite).
    If current LOCAL_QDRANT_PATH is an embedded Qdrant dir, we just no-op.
    """
    base = LOCAL_QDRANT_PATH
    if _is_qdrant_embedded(base):
        _log(f"ℹ️ Local path '{base}' is embedded Qdrant, not SQLite/Chroma. Skipping SQLite debug.")
        return

    db_path = os.path.join(base, "storage.sqlite")
    if not os.path.exists(db_path):
        _log(f"❌ SQLite not found at {db_path}")
        return

    _log(f"🔍 Examining SQLite database: {db_path}")
    _log(f"📊 File size: {os.path.getsize(db_path) / 1024 / 1024:.1f} MB")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [t[0] for t in cur.fetchall()]
    _log("\n📋 Tables in database:")
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM `{t}`")
            cnt = cur.fetchone()[0]
            _log(f"  - {t}: {cnt} rows")
            cur.execute(f"PRAGMA table_info(`{t}`)")
            cols = [c[1] for c in cur.fetchall()]
            _log(f"    Columns: {cols}")
            if cnt > 0:
                cur.execute(f"SELECT * FROM `{t}` LIMIT 1")
                sample = cur.fetchone()
                _log(f"    Sample: {str(sample)[:100]}...")
        except Exception as e:
            _log(f"  - {t}: Error - {e}")
    conn.close()

# ===================== Local connect (now uses LOCAL_QDRANT_PATH) =====================

def try_qdrant_connection() -> Tuple[Optional[QdrantClient], Optional[str], Optional[List[Record]]]:
    """
    Try to open embedded/local Qdrant at LOCAL_QDRANT_PATH with several strategies.
    Returns (client, first_collection_name_with_data, sample_points) or (None, None, None).
    """
    base = LOCAL_QDRANT_PATH
    _log(f"\n🔧 Trying local Qdrant: {base}")

    def _attempt(path_kwargs: Dict[str, Any]) -> Tuple[Optional[QdrantClient], Optional[str], Optional[List[Record]]]:
        try:
            client = QdrantClient(**path_kwargs)
            cols = client.get_collections().collections
            _log(f"   ✅ Found {len(cols)} collections")
            for c in cols:
                try:
                    info = client.get_collection(c.name)
                    points_count = getattr(info, "points_count", 0) or 0
                    _log(f"   - {c.name}: ~{points_count} points")
                    # Preferred: paginated scroll
                    try:
                        for chunk in paginate_scroll(client, c.name, batch=5, with_vectors=True, with_payload=True):
                            if chunk:
                                _log(f"   - paginate_scroll ok: {len(chunk)} pts")
                                return client, c.name, chunk
                    except Exception as e_pag:
                        _log(f"   - paginate_scroll failed: {e_pag}")
                    # Fallback: standard scroll
                    try:
                        pts, _ = client.scroll(
                            collection_name=c.name, limit=5, with_payload=True, with_vectors=True
                        )
                        if pts:
                            _log(f"   - scroll ok: {len(pts)} pts")
                            return client, c.name, pts
                    except Exception as e_std:
                        _log(f"   - scroll failed: {e_std}")
                    # Fallback: payload only
                    try:
                        pts, _ = client.scroll(
                            collection_name=c.name, limit=5, with_payload=True, with_vectors=False
                        )
                        if pts:
                            _log(f"   - payload-only scroll ok: {len(pts)} pts")
                            return client, c.name, pts
                    except Exception as e_no_vec:
                        _log(f"   - payload-only scroll failed: {e_no_vec}")
                except Exception as e_col:
                    _log(f"   - Error inspecting {c.name}: {e_col}")
            return client, None, None
        except Exception as e:
            _log(f"   ❌ Connection failed {path_kwargs}: {e}")
            return None, None, None

    # Embedded/local Qdrant
    client, name, sample = _attempt({"path": base, "force_disable_check_same_thread": True, "timeout": 30})
    if client and name and sample:
        return client, name, sample

    client, name, sample = _attempt({"path": base})
    if client and name and sample:
        return client, name, sample

    _log("\n💡 No non-empty collections found or local DB not accessible.")
    return None, None, None

# ===================== High-level ops (minimal changes: use LOCAL_QDRANT_PATH + connect_cloud) =====================

def upload_to_cloud() -> None:
    """Upload the whole local embedded Qdrant dataset to Qdrant Cloud."""
    _log("🚀 QDRANT CLOUD UPLOADER\n" + "=" * 50)

    # Pre-flight
    if not Path(LOCAL_QDRANT_PATH).exists():
        _log(f"❌ Local path not found: {LOCAL_QDRANT_PATH}")
        return

    # Optional legacy debug (only if Chroma-style)
    debug_sqlite_structure()

    # Local connect
    client, collection_name, sample_points = try_qdrant_connection()
    if not client:
        _log("\n❌ Could not connect to local Qdrant database")
        return
    if not collection_name:
        _log("\n⚠️ No non-empty collections found")
        return

    _log(f"\n🎯 Using local collection: {collection_name}")

    # Dim inference from sample
    if not sample_points:
        _log("❌ No sample points available to infer dimension")
        return
    sample_vec = getattr(sample_points[0], "vector", None)
    dim = get_vector_dimension(sample_vec)
    _log(f"   - Inferred vector dimension: {dim}")

    # Cloud connect
    cloud = connect_cloud()
    if not cloud:
        return

    _ensure_cloud_collection(cloud, CLOUD_COLLECTION, dim)

    # Read all local data via pagination
    total = 0
    try:
        for chunk in paginate_scroll(client, collection_name, batch=4096, with_vectors=True, with_payload=True):
            points = convert_records_to_point_structs(chunk)
            if not points:
                continue
            for i in range(0, len(points), BATCH_SIZE):
                batch = points[i:i + BATCH_SIZE]
                _upsert_with_retries(cloud, CLOUD_COLLECTION, batch)
                total += len(batch)
                if total % (BATCH_SIZE * 10) == 0:
                    _log(f"… uploaded {total} points so far")
    except Exception as e:
        _log(f"⚠️ Upload loop failed: {e}")
        return

    # Verify
    try:
        info = cloud.get_collection(CLOUD_COLLECTION)
        count = getattr(info, "points_count", 0) or 0
        _log(f"\n🎉 Upload complete! Cloud now reports ~{count} points (sent ~{total}).")
    except Exception as e:
        _log(f"⚠️ Uploaded but verification failed: {e}")

def add_new_documents(file_paths: List[str], source_name: Optional[str] = None) -> None:
    """Chunk + embed new docs and push directly to Qdrant Cloud."""
    _log("📚 Adding new documents to cloud...")
    _log(f"Files: {file_paths}")

    cloud = connect_cloud()
    if not cloud:
        return

    embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    _ensure_cloud_collection(cloud, CLOUD_COLLECTION, DEFAULT_DIM)

    docs = []
    for p in file_paths:
        _log(f"📄 Processing: {p}")
        try:
            loader = PyPDFLoader(p) if p.lower().endswith(".pdf") else TextLoader(p)
            loaded = loader.load()
            splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            chunks = splitter.split_documents(loaded)
            for ch in chunks:
                ch.metadata["source"] = source_name or os.path.basename(p)
                ch.metadata["file_path"] = p
            docs.extend(chunks)
            _log(f"   Created {len(chunks)} chunks")
        except Exception as e:
            _log(f"❌ Error processing {p}: {e}")

    if not docs:
        _log("❌ No documents processed")
        return

    _log(f"📊 Total chunks to upload: {len(docs)}")
    _log("🤖 Creating embeddings...")
    texts = [d.page_content for d in docs]
    embs = embedder.embed_documents(texts)

    points: List[PointStruct] = []
    for d, vec in zip(docs, embs):
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vec,
                payload={
                    "text": d.page_content,
                    "source": d.metadata.get("source", "unknown"),
                    "file_path": d.metadata.get("file_path", "unknown"),
                },
            )
        )

    _log("⬆️ Uploading to cloud...")
    uploaded = 0
    for i in range(0, len(points), BATCH_SIZE):
        batch = points[i:i + BATCH_SIZE]
        _upsert_with_retries(cloud, CLOUD_COLLECTION, batch)
        uploaded += len(batch)
        _log(f"   Uploaded {uploaded}/{len(points)}")

    try:
        info = cloud.get_collection(CLOUD_COLLECTION)
        _log(f"🎉 Success! Cloud now has ~{getattr(info, 'points_count', 0) or 0} total points")
    except Exception:
        pass

def replace_sqlite_database(new_sqlite_path: str, backup_old: bool = True) -> bool:
    """
    Replace local SQLite database (legacy Chroma-style). If LOCAL_QDRANT_PATH
    is an embedded Qdrant dir, this is not applicable but kept for compat.
    """
    base = LOCAL_QDRANT_PATH
    if _is_qdrant_embedded(base):
        _log(f"ℹ️ Current local path '{base}' is embedded Qdrant; replace_sqlite_database is a no-op here.")
        return True

    _log(f"🔄 Replacing SQLite database with: {new_sqlite_path}")
    if not os.path.exists(new_sqlite_path):
        _log(f"❌ New SQLite file not found: {new_sqlite_path}")
        return False

    old_sqlite = os.path.join(base, "storage.sqlite")
    os.makedirs(os.path.dirname(old_sqlite), exist_ok=True)

    if os.path.exists(old_sqlite):
        old_size = os.path.getsize(old_sqlite) / (1024 * 1024)
        new_size = os.path.getsize(new_sqlite_path) / (1024 * 1024)
        _log(f"📊 Old DB: {old_size:.1f} MB | New DB: {new_size:.1f} MB")
        if backup_old:
            backup_path = f"{base}_backup_{int(old_size)}MB.sqlite"
            _log(f"💾 Backing up old DB → {backup_path}")
            shutil.copy2(old_sqlite, backup_path)

    shutil.copy2(new_sqlite_path, old_sqlite)
    _log("✅ Database replaced")

    # Quick verify (legacy)
    try:
        client = QdrantClient(path=base, force_disable_check_same_thread=True)
        cols = client.get_collections().collections
        total_points = 0
        for c in cols:
            info = client.get_collection(c.name)
            cnt = getattr(info, "points_count", 0) or 0
            _log(f"📋 {c.name}: ~{cnt} points")
            total_points += cnt
        _log(f"🎉 New DB loaded with ~{total_points} points")
        return True
    except Exception as e:
        _log(f"❌ Verify failed: {e}")
        return False

def sync_latest_to_cloud(replace_existing: bool = False) -> None:
    """Upload latest local DB to cloud; optionally replace existing collection."""
    _log("🔄 SYNC LATEST DATABASE TO CLOUD")

    cloud = connect_cloud()
    if not cloud:
        return

    if replace_existing:
        _log("⚠️ This will REPLACE all existing data in cloud collection!")
        confirm = input("Type 'yes' to proceed: ").strip().lower()
        if confirm != "yes":
            _log("❌ Cancelled")
            return
        try:
            names = [c.name for c in cloud.get_collections().collections]
            if CLOUD_COLLECTION in names:
                _log(f"🗑️ Deleting {CLOUD_COLLECTION}")
                cloud.delete_collection(CLOUD_COLLECTION)
        except Exception as e:
            _log(f"⚠️ Delete failed/ignored: {e}")

    upload_to_cloud()

def merge_databases(new_sqlite_path: str) -> None:
    """Merge points from another embedded DB directory into the cloud collection."""
    _log(f"🔄 MERGING NEW DATABASE: {new_sqlite_path}")
    if not os.path.exists(new_sqlite_path):
        _log(f"❌ File not found: {new_sqlite_path}")
        return

    with tempfile.TemporaryDirectory() as tmp:
        src_dir = os.path.dirname(new_sqlite_path) if new_sqlite_path.endswith("storage.sqlite") else new_sqlite_path
        shutil.copytree(src_dir, os.path.join(tmp, "qdrant"), dirs_exist_ok=True)
        new_path = os.path.join(tmp, "qdrant")

        try:
            local = QdrantClient(path=new_path, force_disable_check_same_thread=True)
            cols = local.get_collections().collections
            _log("📋 New DB collections:")
            for c in cols:
                info = local.get_collection(c.name)
                _log(f"  - {c.name}: ~{getattr(info, 'points_count', 0) or 0} points")

            cloud = connect_cloud()
            if not cloud:
                return

            # Infer dim from first available point across collections
            dim = DEFAULT_DIM
            for c in cols:
                for chunk in paginate_scroll(local, c.name, batch=8, with_vectors=True, with_payload=True):
                    if chunk:
                        dim = get_vector_dimension(getattr(chunk[0], "vector", None))
                        break
                if dim:
                    break

            _ensure_cloud_collection(cloud, CLOUD_COLLECTION, dim)

            # Upload
            for c in cols:
                _log(f"⬆️ Uploading from {c.name} ...")
                total = 0
                for chunk in paginate_scroll(local, c.name, batch=4096, with_vectors=True, with_payload=True):
                    pts = convert_records_to_point_structs(chunk)
                    for i in range(0, len(pts), BATCH_SIZE):
                        _upsert_with_retries(cloud, CLOUD_COLLECTION, pts[i:i + BATCH_SIZE])
                        total += len(pts[i:i + BATCH_SIZE])
                        if total % (BATCH_SIZE * 10) == 0:
                            _log(f"   … {total} uploaded")
                _log(f"✅ Completed {c.name} ({total} points)")

            info = cloud.get_collection(CLOUD_COLLECTION)
            _log(f"🎉 Merge complete! Cloud now has ~{getattr(info, 'points_count', 0) or 0} points")

        except Exception as e:
            _log(f"❌ Error during merge: {e}")

# ===================== CLI (unchanged behavior) =====================

def main() -> None:
    parser = argparse.ArgumentParser(description="Qdrant Cloud Manager")
    parser.add_argument("--migrate", action="store_true", help="Upload existing local DB to cloud")
    parser.add_argument("--add", nargs="+", help="Add new documents to cloud")
    parser.add_argument("--source", help="Source name for new documents")
    parser.add_argument("--replace-sqlite", help="Replace local SQLite with new trained database (legacy)")
    parser.add_argument("--sync-latest", action="store_true", help="Upload latest local database to cloud")
    parser.add_argument("--replace-cloud", action="store_true", help="Replace ALL cloud data when syncing")
    parser.add_argument("--merge-sqlite", help="Merge another embedded DB directory (or its storage.sqlite) into cloud")
    args = parser.parse_args()

    if args.migrate:
        _log("🔄 MIGRATING EXISTING LOCAL DATABASE TO CLOUD")
        upload_to_cloud()
    elif args.add:
        _log("📚 ADDING NEW DOCUMENTS TO CLOUD")
        add_new_documents(args.add, args.source)
    elif args.replace_sqlite:
        _log("🔄 REPLACING LOCAL SQLITE DATABASE (legacy)")
        if replace_sqlite_database(args.replace_sqlite):
            _log("✅ Database replaced. Run --sync-latest to upload to cloud")
    elif args.sync_latest:
        _log("🔄 SYNCING LATEST DATABASE TO CLOUD")
        sync_latest_to_cloud(replace_existing=args.replace_cloud)
    elif args.merge_sqlite:
        _log("🔄 MERGING NEW DATABASE WITH CLOUD")
        merge_databases(args.merge_sqlite)
    else:
        _log("🚀 QDRANT CLOUD MANAGER")
        _log(f"Local path: {LOCAL_QDRANT_PATH} "
             f"({'Qdrant-embedded' if _is_qdrant_embedded(LOCAL_QDRANT_PATH) else 'Chroma/SQLite' if _is_chroma_dir(LOCAL_QDRANT_PATH) else 'Unknown'})")
        _log(f"Cloud collection: {CLOUD_COLLECTION}")
        _log("Default action: migrating local → cloud…")
        upload_to_cloud()

if __name__ == "__main__":
    main()
