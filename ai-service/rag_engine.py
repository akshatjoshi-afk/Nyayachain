from qdrant_client import QdrantClient, models
from qdrant_client.models import Filter, FieldCondition, MatchValue
import uuid

COLLECTION_NAME = "case_documents"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Stores data in a local folder called qdrant_data — no separate Qdrant server needed
client = QdrantClient(path="./qdrant_data")


def ensure_collection():
    if not client.collection_exists(COLLECTION_NAME):
        vector_size = client.get_embedding_size(EMBEDDING_MODEL)
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
        )


def ingest_document(text: str, case_id: str, doc_name: str, chunk_size: int = 300, overlap: int = 50):
    ensure_collection()
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        chunks.append(" ".join(words[start:start + chunk_size]))
        start += chunk_size - overlap

    points = [
        models.PointStruct(
            id=str(uuid.uuid4()),
            vector=models.Document(text=chunk, model=EMBEDDING_MODEL),
            payload={"text": chunk, "case_id": case_id, "doc_name": doc_name, "chunk_index": i},
        )
        for i, chunk in enumerate(chunks)
    ]
    client.upsert(collection_name=COLLECTION_NAME, points=points)
    return {"chunks_ingested": len(chunks)}


def query_documents(question: str, case_id: str, top_k: int = 4):
    ensure_collection()
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=models.Document(text=question, model=EMBEDDING_MODEL),
        query_filter=Filter(must=[FieldCondition(key="case_id", match=MatchValue(value=case_id))]),
        limit=top_k,
    )
    return [
        {"text": r.payload["text"], "doc_name": r.payload["doc_name"], "score": round(r.score, 4)}
        for r in results.points
    ]