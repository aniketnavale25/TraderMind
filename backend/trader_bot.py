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

load_dotenv()

# ── Trader config (NO csv key — files auto-discovered from folders) ──
TRADERS = {
    "lynch": {
        "name": "Peter Lynch",
        "system": (
            "You are Peter Lynch, legendary manager of Fidelity Magellan Fund "
            "from 1977 to 1990, achieving a 29.2% average annual return. "
            "Respond in first person using 'I', 'my', 'me'. "
            "Answer the user's CURRENT question directly and concisely. "
            "NEVER repeat yourself or mention that you are repeating. "
            "NEVER say 'It seems I've repeated' or similar phrases. "
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


def load_trader_documents(trader_id: str, data_dir: str) -> list[Document]:
    """
    Auto-loads ALL files from data/<trader_id>/ folder.
    Supports .csv, .pdf, .txt — just drop files in the folder.
    """
    trader_dir = os.path.join(data_dir, trader_id)
    documents  = []

    if not os.path.exists(trader_dir):
        print(f"   ⚠️  No folder found at {trader_dir}")
        return documents

    files = os.listdir(trader_dir)
    if not files:
        print(f"   ⚠️  No files found in {trader_dir}")
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
                documents += [Document(page_content=qa) for qa in qa_pairs]
                print(f"   📄 {filename} → {len(qa_pairs)} Q&A pairs")

            elif ext == "pdf":
                loader   = PyPDFLoader(filepath)
                pdf_docs = loader.load()
                documents += pdf_docs
                print(f"   📕 {filename} → {len(pdf_docs)} pages")

            elif ext == "txt":
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                documents.append(Document(page_content=content))
                print(f"   📝 {filename} → loaded")

        except Exception as e:
            print(f"   ❌ Error loading {filename}: {e}")

    return documents


def load_pipeline():
    global groq_client, embedding_model

    # ── Embeddings ────────────────────────────────────────────
    device = "cuda" if torch.cuda.is_available() else "cpu"
    embedding_model = HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-MiniLM-L6-v2",
        model_kwargs={"device": device},
    )

    data_dir   = os.path.join(os.path.dirname(__file__), "data")
    chroma_dir = os.path.join(os.path.dirname(__file__), "chroma_traders")

    for trader_id, config in TRADERS.items():
        print(f"\n🔄 Loading {config['name']}...")
        trader_chroma = os.path.join(chroma_dir, trader_id)

        if os.path.exists(trader_chroma):
            # Fast path — load from cache
            print(f"   ⚡ {config['name']}: Loading from existing ChromaDB cache")
            vector_dbs[trader_id] = Chroma(
                persist_directory=trader_chroma,
                embedding_function=embedding_model,
                collection_name=f"trader_{trader_id}",
            )
            continue

        # Slow path — build from files
        documents = load_trader_documents(trader_id, data_dir)
        if not documents:
            print(f"   ⚠️  No data found for {config['name']} — skipping")
            continue

        chunks = RecursiveCharacterTextSplitter(
            chunk_size=512, chunk_overlap=64
        ).split_documents(documents)

        vector_dbs[trader_id] = Chroma.from_documents(
            documents=chunks,
            embedding=embedding_model,
            persist_directory=os.path.join(chroma_dir, trader_id),
            collection_name=f"trader_{trader_id}",
        )
        print(f"   ✅ {config['name']}: {len(chunks)} chunks indexed and cached")

    groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    print("\n✅ All traders loaded — pipeline ready")


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

    retrieval_query = question
    if history:
        last = history[-1]
        retrieval_query = f"{last['user']} {last['assistant']} {question}"

    results = vector_dbs[trader_id].similarity_search(retrieval_query, k=6)
    
    # Deduplicate chunks by content
    seen    = set()
    unique  = []
    for doc in results:
        content = doc.page_content.strip()
        if content not in seen:
            seen.add(content)
            unique.append(content)
        if len(unique) == 4:
            break
    
    context = "\n\n".join(unique)

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