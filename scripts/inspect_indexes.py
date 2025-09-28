from __future__ import annotations
from pathlib import Path
from typing import Optional, List, Tuple
import os, sys, json

# --- Try imports and fail friendly ---
try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models as qm
except Exception as e:
    QdrantClient = None

try:
    import chromadb
except Exception as e:
    chromadb = None

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None


# ---------- Config ----------
EMB_MODEL = os.getenv("EMB_MODEL", "intfloat/e5-small-v2")  # change if you indexed with something else
TEST_QUERY = os.getenv("TEST_QUERY", "how do I configure grafana dashboards and alerts?")
# --------------------------------

ROOT = Path(__file__).resolve().parents[1]

PATHS = {
    "qdrant_live": ROOT / "slurpy_qdrant_live",
    "qdrant_index": ROOT / "slurpy_qdrant_index",
    "chroma_full": ROOT / "ed_index_full",
}

def is_qdrant(path: Path) -> bool:
    return (path / "meta.json").exists() and (path / "collection").exists()

def is_chroma(path: Path) -> bool:
    return (path / "storage.sqlite").exists() or (path / "collection").exists()

def load_embedder():
    if SentenceTransformer is None:
        print("! sentence-transformers not installed. Skip embedding/search.")
        return None
    emb = SentenceTransformer(EMB_MODEL)
    return emb

def encode_query(emb, text: str):
    name = (EMB_MODEL or "").lower()
    if "e5" in name or "bge" in name:
        return emb.encode(f"query: {text}", normalize_embeddings=True).tolist()
    return emb.encode(text, normalize_embeddings=True).tolist()

# ---------- Qdrant ----------
def inspect_qdrant(path: Path, run_search: bool = True):
    if QdrantClient is None:
        print("! qdrant-client not installed. Skip Qdrant.")
        return
    print(f"\n=== QDRANT @ {path} ===")
    client = QdrantClient(path=str(path))
    cols = client.get_collections()
    names = [c.name for c in getattr(cols, "collections", [])]
    print(f"Collections: {names or '[]'}")
    if not names:
        return
    # pick first collection
    coll = names[0]
    info = client.get_collection(coll)
    print(f"Collection info for '{coll}':")
    print(f"  vectors_count: {getattr(info, 'vectors_count', 'n/a')}")
    try:
        points, _ = client.scroll(collection_name=coll, limit=3, with_payload=True, with_vectors=False)
        print("Sample payload keys:")
        for p in points:
            pl = p.payload or {}
            print(" ", list(pl.keys())[:8], {"dataset_id": pl.get("dataset_id"), "doc_id": pl.get("doc_id"), "chunk_idx": pl.get("chunk_idx")})
    except Exception as e:
        print("Scroll error:", e)

    if run_search:
        emb = load_embedder()
        if emb:
            vec = encode_query(emb, TEST_QUERY)
            res = client.search(collection_name=coll, query_vector=vec, limit=3, with_payload=True)
            print("Search sample (top 3):")
            for i, r in enumerate(res):
                txt = (r.payload or {}).get("text", "")
                snippet = txt[:120].replace('\n', ' ')
                print(f"  {i+1}. score={r.score:.4f} text={snippet}...")

# ---------- Chroma ----------
def inspect_chroma(path: Path, run_search: bool = True):
    if chromadb is None:
        print("! chromadb not installed. Skip Chroma.")
        return
    print(f"\n=== CHROMA @ {path} ===")
    client = chromadb.PersistentClient(path=str(path))
    colls = client.list_collections()
    names = [c.name for c in colls]
    print(f"Collections: {names or '[]'}")
    if not names:
        return
    coll = colls[0]
    print(f"Using collection '{coll.name}'")
    # Peek docs
    try:
        docs = coll.get(limit=3, include=["documents","metadatas"])
        for i in range(len(docs.get("ids", []))):
            metadatas = docs.get("metadatas", [{}]) or [{}]
            meta = metadatas[i] if i < len(metadatas) else {}
            meta = meta or {}
            print("  doc", i+1, "| keys:", list(meta.keys())[:8], "| meta:", {k: meta.get(k) for k in ["dataset_id","doc_id","chunk_idx","title","source","url"]})
    except Exception as e:
        print("Fetch error:", e)

    if run_search:
        emb = load_embedder()
        if emb:
            qvec = encode_query(emb, TEST_QUERY)
            # Chroma expects list of queries
            try:
                res = coll.query(query_embeddings=[qvec], n_results=3, include=["documents","distances","metadatas"])
                if res is None:
                    print("Query returned None")
                    return
                docs_list = res.get("documents", [[]])
                dists_list = res.get("distances", [[]])
                metas_list = res.get("metadatas", [[]])
                
                if not docs_list or not dists_list or not metas_list:
                    print("Query returned empty results")
                    return
                    
                docs = docs_list[0]
                dists = dists_list[0]
                metas = metas_list[0]
                print("Search sample (top 3):")
                for i, (d, dist, m) in enumerate(zip(docs, dists, metas)):
                    snippet = (d or "")[:120].replace("\n"," ")
                    print(f"  {i+1}. dist={dist:.4f} text={snippet}...")
            except Exception as e:
                print("Query error:", e)

def main():
    any_found = False

    # Qdrant live/index (prefer live if exists)
    q_paths = [PATHS["qdrant_live"], PATHS["qdrant_index"]]
    for p in q_paths:
        if p.exists() and is_qdrant(p):
            any_found = True
            inspect_qdrant(p)

    # Chroma full
    p = PATHS["chroma_full"]
    if p.exists() and is_chroma(p):
        any_found = True
        inspect_chroma(p)

    if not any_found:
        print("No known indexes found. Checked:")
        for k, v in PATHS.items():
            print(" -", k, v)

if __name__ == "__main__":
    main()
