import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

SYSTEM_PROMPT = (
    "You are an investigation assistant. Answer ONLY using the provided excerpts. "
    "If the answer isn't there, say so clearly. Cite which excerpt number(s) you used."
)

def call_llm(question: str, chunks: list) -> str:
    if not chunks:
        return "No relevant documents found for this case."

    context = "\n\n".join(
        f"[Excerpt {i+1}] (source: {c['doc_name']})\n{c['text']}" for i, c in enumerate(chunks)
    )
    prompt = f"{SYSTEM_PROMPT}\n\n{context}\n\nQuestion: {question}"

    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents=prompt,
    )
    return response.text