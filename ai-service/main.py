from fastapi import FastAPI
from pydantic import BaseModel
import rag_engine
import llm

app = FastAPI(title="NyayaChain AI Service")

@app.get("/")
def health_check():
    return {"status": "ok", "service": "NyayaChain AI Service"}


class IngestRequest(BaseModel):
    text: str
    case_id: str
    doc_name: str

@app.post("/ingest")
def ingest(req: IngestRequest):
    return rag_engine.ingest_document(req.text, req.case_id, req.doc_name)


class QueryRequest(BaseModel):
    question: str
    case_id: str

@app.post("/query")
def query(req: QueryRequest):
    chunks = rag_engine.query_documents(req.question, req.case_id)
    answer = llm.call_llm(req.question, chunks)
    return {"answer": answer, "sources": chunks}