from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from trader_bot import ask_trader, load_pipeline, TRADERS

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "https://tradermind-orpin.vercel.app",
        "https://aniketnx-tradermind-api.hf.space",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.on_event("startup")
async def startup():
    load_pipeline()

# ── Models ────────────────────────────────────────────────────
class Message(BaseModel):
    user:      str
    assistant: str

class ChatRequest(BaseModel):
    trader_id: str = "lynch"
    question:  str
    history:   list[Message] = []

class ChatResponse(BaseModel):
    answer: str

# ── Endpoints ─────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    history = [{"user": m.user, "assistant": m.assistant} for m in req.history]
    answer  = ask_trader(req.trader_id, req.question, history)
    return ChatResponse(answer=answer)

@app.get("/traders")
async def get_traders():
    """Returns list of available traders for the frontend."""
    return {
        trader_id: {"name": config["name"]}
        for trader_id, config in TRADERS.items()
    }

@app.get("/health")
async def health():
    return {"status": "ok"}