from qdrant_client import QdrantClient
import os
c = QdrantClient(url=os.getenv("QDRANT_URL"), api_key=os.getenv("QDRANT_API_KEY"))
print(c.get_collections())
info = c.get_collection("slurpy_chunks")   # or your name
print(info)
cnt = c.count("slurpy_chunks", exact=True).count
print("cloud points:", cnt)
