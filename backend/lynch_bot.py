import os
import torch
import pandas as pd
from groq import Groq
from dotenv import load_dotenv

load_dotenv()  # loads .env file

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader

# ── Global objects (loaded once) ─────────────────────────────
vector_db   = None
groq_client = None

def load_pipeline():
    global vector_db, groq_client

    # ── 1. Load Lynch.csv ─────────────────────────────────────
    csv_path = os.path.join(os.path.dirname(__file__), "data", "Lynch.csv")
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()
    df = df.dropna(subset=["questions", "answers"])

    qa_pairs = [
        f"Label: {row['labels']}\nQ: {row['questions']}\nA: {row['answers']}"
        for _, row in df.iterrows()
    ]
    csv_documents = [Document(page_content=qa) for qa in qa_pairs]
    print(f"✅ CSV loaded: {len(csv_documents)} Q&A pairs")

    # ── 2. Load Lynch PDF ─────────────────────────────────────
    pdf_path = os.path.join(os.path.dirname(__file__), "data", "the-peter-lynch-playbook.pdf")
    pdf_documents = []
    if os.path.exists(pdf_path):
        loader = PyPDFLoader(pdf_path)
        pdf_documents = loader.load()
        print(f"✅ PDF loaded: {len(pdf_documents)} pages")
    else:
        print("⚠️ PDF not found — using CSV only")

    documents = csv_documents + pdf_documents

    # ── 2. Chunk ──────────────────────────────────────────────
    chunks = RecursiveCharacterTextSplitter(
        chunk_size=512, chunk_overlap=64
    ).split_documents(documents)

    # ── 3. Embeddings ─────────────────────────────────────────
    device = "cuda" if torch.cuda.is_available() else "cpu"
    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-MiniLM-L6-v2",
        model_kwargs={"device": device},
    )

    # ── 4. ChromaDB ───────────────────────────────────────────
    chroma_dir = os.path.join(os.path.dirname(__file__), "chroma_peter_lynch")
    vector_db = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=chroma_dir,
        collection_name="peter_lynch_kb",
    )

    # ── 5. Groq client ────────────────────────────────────────
    groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    print("✅ Pipeline ready — using Groq (Llama 3)")


def ask_lynch_bot(question: str, history: list[dict] | None = None) -> str:
    """Full RAG pipeline: retrieve → prompt → generate."""
    if vector_db is None or groq_client is None:
        load_pipeline()

    if not question.strip():
        return "Please enter a question."

    # ── Retrieve top-4 chunks ─────────────────────────────────
    # Combine last history turn + question for better retrieval
    # on short/follow-up questions like "when?" or "explain more"
    retrieval_query = question
    if history:
        last = history[-1]
        retrieval_query = f"{last['user']} {last['assistant']} {question}"

    results = vector_db.similarity_search(retrieval_query, k=4)
    context = "\n\n".join([doc.page_content for doc in results])

    # ── Build messages ────────────────────────────────────────
    messages = [
        {
            "role": "system",
            "content": (
                "You are Peter Lynch, the legendary investor who managed Fidelity's "
                "Magellan Fund from 1977 to 1990, achieving a 29.2% average annual return. "
                "Always respond in first person as Peter Lynch using 'I', 'my', 'me'. "
                "Answer the user's CURRENT question directly — do not repeat previous answers. "
                "Use ONLY the provided context to answer. "
                "If asked who you are, introduce yourself as Peter Lynch. "
                "If the answer is not in the context, say: "
                "'That is not something I can speak to from my experience.'"
            )
        }
    ]

    # Add last 3 conversation turns for memory
    for turn in (history or [])[-3:]:
        messages.append({"role": "user",      "content": turn["user"]})
        messages.append({"role": "assistant", "content": turn["assistant"]})

    # Add current question with retrieved context
    messages.append({
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {question}"
    })

    # ── Generate ──────────────────────────────────────────────
    response = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.2,
        max_tokens=512,
    )
    return response.choices[0].message.content.strip()