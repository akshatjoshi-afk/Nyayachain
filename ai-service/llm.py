import os
import json
import re
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

SYSTEM_PROMPT = (
    "You are an investigation assistant. Answer ONLY using the provided excerpts. "
    "If the answer isn't there, say so clearly. Cite which excerpt number(s) you used."
)

EXTRACTION_SYSTEM_PROMPT = (
    "You are a legal and investigative entity-relationship extraction assistant. "
    "Extract all relevant entities and relationships from the provided document text.\n\n"
    "Rules:\n"
    "1. Entity types MUST be one of: PERSON, ORG, LOCATION, EVIDENCE, EVENT.\n"
    "2. If type is EVENT, extract an optional 'date' string in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ) if mentioned in text, otherwise null. For other types, date should be null.\n"
    "3. Return STRICT JSON without markdown code block formatting or explanations. Format:\n"
    "{\n"
    '  "entities": [\n'
    '    { "name": "Ramesh Kumar", "type": "PERSON", "date": null },\n'
    '    { "name": "Cyber Heist Incident", "type": "EVENT", "date": "2026-03-15T10:00:00Z" }\n'
    "  ],\n"
    '  "relationships": [\n'
    '    { "source_entity": "Ramesh Kumar", "target_entity": "Suresh\'s Shop", "relationship_type": "OWNER_OF" }\n'
    "  ]\n"
    "}"
)

def call_llm(question: str, chunks: list) -> str:
    if not chunks:
        return "No relevant documents found for this case."

    context = "\n\n".join(
        f"[Excerpt {i+1}] (source: {c['doc_name']})\n{c['text']}" for i, c in enumerate(chunks)
    )
    prompt = f"{SYSTEM_PROMPT}\n\n{context}\n\nQuestion: {question}"

    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=prompt,
    )
    return response.text

def extract_graph(text: str) -> dict:
    if not text or not text.strip():
        return {"entities": [], "relationships": []}

    prompt = f"{EXTRACTION_SYSTEM_PROMPT}\n\nDocument Text:\n{text}"

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt,
        )
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?\n?", "", raw_text)
            raw_text = re.sub(r"\n?```$", "", raw_text).strip()

        data = json.loads(raw_text)
        return {
            "entities": data.get("entities", []),
            "relationships": data.get("relationships", []),
        }
    except Exception as e:
        print(f"Graph extraction error: {e}")
        return {"entities": [], "relationships": []}