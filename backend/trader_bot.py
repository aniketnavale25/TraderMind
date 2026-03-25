import os
import torch
import pandas as pd
from dotenv import load_dotenv
from groq import Groq
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from sentence_transformers import CrossEncoder

load_dotenv()

# ── Trader config ─────────────────────────────────────────────
TRADERS = {
    "lynch": {
        "name": "Peter Lynch",
        "system": (
            "You are Peter Lynch, legendary manager of Fidelity Magellan Fund "
            "from 1977 to 1990, achieving a 29.2% average annual return. "
            "Respond in first person using 'I', 'my', 'me'. "
            "Answer the user's CURRENT question directly and concisely. "
            "NEVER repeat yourself or mention that you are repeating. "
            "Use ONLY the provided context. "
            "If asked who you are, introduce yourself as Peter Lynch. "
            "If the answer is not in the context, say: "
            "'That is not something I can speak to from my experience.'"
        ),
    },
    "buffett": {
        "name": "Warren Buffett",
        "system": (
            "You are Warren Buffett, Chairman and CEO of Berkshire Hathaway, "
            "known as the Oracle of Omaha. Respond in first person using 'I', 'my', 'me'. "
            "Answer the user's CURRENT question directly and concisely. "
            "NEVER repeat yourself or mention that you are repeating. "
            "Use ONLY the provided context. "
            "If asked who you are, introduce yourself as Warren Buffett. "
            "If the answer is not in the context, say: "
            "'That is not something I can speak to from my experience.'"
        ),
    },
    "soros": {
        "name": "George Soros",
        "system": (
            "You are George Soros, founder of Soros Fund Management. "
            "Respond in first person using 'I', 'my', 'me'. "
            "Answer the user's CURRENT question directly and concisely. "
            "NEVER repeat yourself or mention that you are repeating. "
            "Use ONLY the provided context. "
            "If asked who you are, introduce yourself as George Soros. "
            "If the answer is not in the context, say: "
            "'That is not something I can speak to from my experience.'"
        ),
    },
    "livermore": {
        "name": "Jesse Livermore",
        "system": (
            "You are Jesse Livermore, one of the greatest stock traders of the "
            "early 20th century. Respond in first person using 'I', 'my', 'me'. "
            "Answer the user's CURRENT question directly and concisely. "
            "NEVER repeat yourself or mention that you are repeating. "
            "Use ONLY the provided context. "
            "If asked who you are, introduce yourself as Jesse Livermore. "
            "If the answer is not in the context, say: "
            "'That is not something I can speak to from my experience.'"
        ),
    },
}

# ── Global objects ────────────────────────────────────────────
vector_dbs:     dict = {}
groq_client          = None
embedding_model      = None
reranker             = None


def load_trader_documents(trader_id: str, data_dir: str) -> list[Document]:
    """Auto-loads all .csv, .pdf, .txt files from data/<trader_id>/"""
    trader_dir = os.path.join(data_dir, trader_id)
    documents  = []

    if not os.path.exists(trader_dir):
        print(f"   ⚠️  No folder found at {trader_dir}")
        return documents

    files = os.listdir(trader_dir)
    if not files:
        print(f"   ⚠️  No files in {trader_dir}")
        return documents

    for filename in files:
        filepath = os.path.join(trader_dir, filename)
        ext      = filename.lower().split(".")[-1]
        try:
            if ext == "csv":
                df = pd.read_csv(filepath)
                df.columns = df.columns.str.strip()
                df = df.dropna(subset=["questions", "answers"])
                qa_pairs = [
                    f"Label: {row.get('labels', 'General')}\n"
                    f"Q: {row['questions']}\nA: {row['answers']}"
                    for _, row in df.iterrows()
                ]
                docs = [Document(
                    page_content=qa,
                    metadata={"source": filename, "trader": trader_id}
                ) for qa in qa_pairs]
                documents += docs
                print(f"   📄 {filename} → {len(qa_pairs)} Q&A pairs")

            elif ext == "pdf":
                loader   = PyPDFLoader(filepath)
                pdf_docs = loader.load()
                # Add source metadata to each page
                for doc in pdf_docs:
                    doc.metadata["source"] = filename
                    doc.metadata["trader"] = trader_id
                documents += pdf_docs
                print(f"   📕 {filename} → {len(pdf_docs)} pages")

            elif ext == "txt":
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                documents.append(Document(
                    page_content=content,
                    metadata={"source": filename, "trader": trader_id}
                ))
                print(f"   📝 {filename} → loaded")

        except Exception as e:
            print(f"   ❌ Error loading {filename}: {e}")

    return documents


def load_pipeline():
    global groq_client, embedding_model, reranker

    # ── IMPROVEMENT 1: Better embedding model ─────────────────
    # all-mpnet-base-v2 has better semantic understanding than
    # paraphrase-MiniLM-L6-v2, especially for financial text
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("⏳ Loading embedding model (all-mpnet-base-v2)...")
    embedding_model = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-mpnet-base-v2",
        model_kwargs={"device": device},
    )

    # ── IMPROVEMENT 2: Cross-encoder reranker ─────────────────
    # Reranks top-20 retrieved chunks to find the best 4
    # Much more accurate than cosine similarity alone
    print("⏳ Loading reranker (cross-encoder/ms-marco-MiniLM-L-6-v2)...")
    reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

    data_dir   = os.path.join(os.path.dirname(__file__), "data")
    chroma_dir = os.path.join(os.path.dirname(__file__), "chroma_traders")

    for trader_id, config in TRADERS.items():
        print(f"\n🔄 Loading {config['name']}...")
        trader_chroma = os.path.join(chroma_dir, trader_id)

        if os.path.exists(trader_chroma):
            print(f"   ⚡ Loading from ChromaDB cache")
            vector_dbs[trader_id] = Chroma(
                persist_directory=trader_chroma,
                embedding_function=embedding_model,
                collection_name=f"trader_{trader_id}",
            )
            continue

        documents = load_trader_documents(trader_id, data_dir)
        if not documents:
            print(f"   ⚠️  No data — skipping")
            continue

        chunks = RecursiveCharacterTextSplitter(
            chunk_size=512, chunk_overlap=64
        ).split_documents(documents)

        vector_dbs[trader_id] = Chroma.from_documents(
            documents=chunks,
            embedding=embedding_model,
            persist_directory=trader_chroma,
            collection_name=f"trader_{trader_id}",
        )
        print(f"   ✅ {len(chunks)} chunks indexed and cached")

    groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    print("\n✅ All traders loaded — pipeline ready")


def expand_query(question: str, trader_name: str) -> str:
    """
    IMPROVEMENT 3: Query expansion
    Rewrites short/vague questions into detailed queries
    for better retrieval. e.g. 'PEG?' → full question about PEG ratio
    """
    if len(question.split()) >= 6:
        return question  # already detailed enough

    expansion_prompt = (
        f"Rewrite this short question into a detailed search query "
        f"for finding information about {trader_name}'s investment philosophy. "
        f"Return ONLY the rewritten query, nothing else.\n\n"
        f"Question: {question}"
    )
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": expansion_prompt}],
            temperature=0.0,
            max_tokens=100,
        )
        expanded = response.choices[0].message.content.strip()
        return expanded if expanded else question
    except Exception:
        return question


def rerank_chunks(query: str, chunks: list, top_k: int = 4) -> list:
    """
    IMPROVEMENT 4: Reranking
    Uses a cross-encoder to rerank retrieved chunks by relevance.
    More accurate than cosine similarity for final selection.
    """
    if not chunks or reranker is None:
        return chunks[:top_k]

    pairs  = [(query, chunk.page_content) for chunk in chunks]
    scores = reranker.predict(pairs)

    ranked = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in ranked[:top_k]]


def ask_trader(
    trader_id: str,
    question:  str,
    history:   list[dict] | None = None,
) -> str:
    if not vector_dbs or groq_client is None:
        load_pipeline()

    if trader_id not in TRADERS:
        return "Trader not found."

    if trader_id not in vector_dbs:
        return (
            f"I don't have any data loaded yet for "
            f"{TRADERS[trader_id]['name']}. "
            f"Add files to data/{trader_id}/ and restart."
        )

    if not question.strip():
        return "Please enter a question."

    config = TRADERS[trader_id]

    # ── IMPROVEMENT 3: Query expansion ───────────────────────
    retrieval_query = question
    if history:
        last = history[-1]
        retrieval_query = f"{last['user']} {last['assistant']} {question}"

    expanded_query = expand_query(retrieval_query, config["name"])

    # ── IMPROVEMENT 5: Retrieve more, rerank to best ─────────
    # Get top-20 candidates, rerank to best 4
    raw_results = vector_dbs[trader_id].similarity_search(expanded_query, k=20)

    # Deduplicate
    seen, unique_chunks = set(), []
    for doc in raw_results:
        content = doc.page_content.strip()
        if content not in seen:
            seen.add(content)
            unique_chunks.append(doc)

    # ── IMPROVEMENT 4: Rerank ─────────────────────────────────
    top_chunks = rerank_chunks(question, unique_chunks, top_k=4)

    # ── IMPROVEMENT 6: Source citation ───────────────────────
    context_parts = []
    for doc in top_chunks:
        source  = doc.metadata.get("source", "unknown")
        content = doc.page_content.strip()
        context_parts.append(f"[From: {source}]\n{content}")
    context = "\n\n".join(context_parts)

    # ── IMPROVEMENT 7: Confidence check ──────────────────────
    # If no good chunks found, say so rather than hallucinating
    if not top_chunks:
        return "That is not something I can speak to from my experience."

    # ── Build messages ────────────────────────────────────────
    messages = [{"role": "system", "content": config["system"]}]
    for turn in (history or [])[-3:]:
        messages.append({"role": "user",      "content": turn["user"]})
        messages.append({"role": "assistant", "content": turn["assistant"]})
    messages.append({
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {question}"
    })

    response = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.2,
        max_tokens=512,
    )
    return response.choices[0].message.content.strip()