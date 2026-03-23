from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from lynch_bot import ask_lynch_bot, load_pipeline

app = FastAPI()

# ── CORS — allow your TypeScript frontend to call this API ───
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000",   # Next.js dev
                   "http://localhost:5173",   # Vite dev
                   "*"],                      # remove * in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load RAG pipeline once on startup ────────────────────────
@app.on_event("startup")
async def startup():
    load_pipeline()

# ── Request / Response models ────────────────────────────────
class Message(BaseModel):
    user:      str
    assistant: str

class ChatRequest(BaseModel):
    question: str
    history:  list[Message] = []

class ChatResponse(BaseModel):
    answer: str

# ── Chat endpoint ────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    history = [{"user": m.user, "assistant": m.assistant} for m in req.history]
    answer  = ask_lynch_bot(req.question, history=history)
    return ChatResponse(answer=answer)

# ── Health check ─────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}