import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  Video,
  Plus,
  Mic,
  ArrowUp,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { sendMessage } from "./api";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Types ─────────────────────────────────────────────────────
interface Message {
  id: string;
  text?: string;
  imageUrl?: string;
  sender: "me" | "them";
  timestamp: Date;
  status?: "delivered" | "read";
}

interface HistoryEntry {
  user: string;
  assistant: string;
}

// ── Suggested questions ───────────────────────────────────────
const SUGGESTIONS = [
  "What is your approach to picking stocks?",
  "How do you think about the PEG ratio?",
  "What is diworseification?",
  "How do you manage risk?",
];

// ── Initial welcome message from Lynch ────────────────────────
const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    text: "Hi! I'm Peter Lynch — former manager of Fidelity Magellan. Ask me anything about investing, stock picking, or my philosophy. 📈",
    sender: "them",
    timestamp: new Date(),
  },
];

// ── Helpers ───────────────────────────────────────────────────

/** Build history array from message list for the backend */
function buildHistory(msgs: Message[]): HistoryEntry[] {
  const history: HistoryEntry[] = [];
  for (let i = 0; i < msgs.length; i++) {
    if (
      msgs[i].sender === "me" &&
      msgs[i + 1]?.sender === "them" &&
      msgs[i].text &&
      msgs[i + 1]?.text
    ) {
      history.push({
        user: msgs[i].text!,
        assistant: msgs[i + 1].text!,
      });
      i++;
    }
  }
  return history.slice(-3);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // ── Send message ────────────────────────────────────────────
  const handleSend = async (text?: string) => {
    const q = (text ?? inputValue).trim();
    if (!q) return;

    setError(null);
    setInputValue("");

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      text: q,
      sender: "me",
      timestamp: new Date(),
      status: "delivered",
    };
    setMessages((prev) => [...prev, userMsg]);

    // Show typing indicator
    setIsTyping(true);

    try {
      const history = buildHistory([...messages, userMsg]);
      const answer = await sendMessage(q, history);

      setIsTyping(false);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: answer,
        sender: "them",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setIsTyping(false);
      setError(
        "Could not reach the backend. Make sure the Python API is running on port 8000.",
      );
      // Remove the delivered status on error
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsg.id ? { ...m, status: undefined } : m,
        ),
      );
    }
  };

  const showSuggestions = messages.length === 1; // only show after welcome msg

  return (
    <div className="flex flex-col h-screen bg-white font-sans text-black overflow-hidden">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-[#F9F9F9]/90 backdrop-blur-xl border-b border-gray-200">
        <button className="flex items-center text-[#007AFF] hover:opacity-70 transition-opacity">
          <ChevronLeft size={28} strokeWidth={2.5} />
          <span className="text-[15px] font-normal ml-0.5">Back</span>
        </button>

        <div className="flex flex-col items-center">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full overflow-hidden mb-0.5 bg-gradient-to-br from-[#1d6fa4] to-[#007AFF] flex items-center justify-center">
            <img
              src="/PL.jpeg"
              alt="Peter Lynch"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.parentElement!.innerHTML =
                  '<span class="text-white text-[12px] font-bold">PL</span>';
              }}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <span className="text-[11px] font-semibold text-black/90">
              Peter Lynch
            </span>
            <ChevronRight size={10} className="text-gray-400" />
          </div>
          {/* Online indicator */}
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
            <span className="text-[10px] text-[#34c759] font-medium">
              Active now
            </span>
          </div>
        </div>

        <button className="text-[#007AFF] hover:opacity-70 transition-opacity">
          <Video size={24} fill="currentColor" />
        </button>
      </header>

      {/* ── Chat Area ── */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar scroll-smooth"
      >
        {/* Date stamp */}
        <div className="flex flex-col items-center mb-6">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-tight">
            iMessage
          </p>
          <p className="text-[11px] font-semibold text-gray-400">
            Today {formatTime(new Date())}
          </p>
        </div>

        <div className="max-w-2xl mx-auto flex flex-col space-y-1">
          <AnimatePresence initial={false}>
            {messages.map((msg, index) => {
              const isMe = msg.sender === "me";
              const nextMsg = messages[index + 1];
              const isLastInGroup = !nextMsg || nextMsg.sender !== msg.sender;

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className={cn(
                    "flex flex-col max-w-[75%]",
                    isMe ? "self-end items-end" : "self-start items-start",
                    isLastInGroup ? "mb-3" : "mb-0.5",
                  )}
                >
                  {msg.imageUrl ? (
                    <div className="rounded-2xl overflow-hidden shadow-sm mb-1 max-w-[280px]">
                      <img
                        src={msg.imageUrl}
                        alt="Attachment"
                        className="w-full h-auto object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "px-4 py-2 text-[16px] leading-snug shadow-sm",
                        isMe
                          ? "bg-[#007AFF] text-white"
                          : "bg-[#E9E9EB] text-black",
                        isMe
                          ? isLastInGroup
                            ? "rounded-2xl rounded-br-md"
                            : "rounded-2xl"
                          : isLastInGroup
                            ? "rounded-2xl rounded-bl-md"
                            : "rounded-2xl",
                      )}
                    >
                      {msg.text}
                    </div>
                  )}

                  {/* Timestamp + status */}
                  {isLastInGroup && (
                    <span className="text-[11px] text-gray-400 mt-1 px-1">
                      {formatTime(msg.timestamp)}
                      {isMe && msg.status && (
                        <span className="ml-1 font-semibold capitalize">
                          {msg.status}
                        </span>
                      )}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex items-center gap-1.5 px-4 py-3 bg-[#E9E9EB] rounded-full w-fit mt-2 self-start"
              >
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error banner */}
          {error && (
            <div className="text-[12px] text-red-500 bg-red-50 rounded-xl px-4 py-2 mt-2 text-center">
              ⚠️ {error}
            </div>
          )}

          {/* Suggested questions */}
          {showSuggestions && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 flex flex-col gap-2"
            >
              <p className="text-[11px] text-gray-400 text-center uppercase tracking-wide font-semibold mb-1">
                Suggested
              </p>
              {SUGGESTIONS.map((q, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => handleSend(q)}
                  className="text-left text-[14px] text-[#007AFF] bg-[#F2F2F7] border border-gray-200 rounded-2xl px-4 py-2.5 hover:bg-[#e8f0fe] transition-colors"
                >
                  {q}
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>
      </main>

      {/* ── Input Bar ── */}
      <footer className="px-4 pb-8 pt-2 bg-white/95 backdrop-blur-md border-t border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <Plus size={28} />
          </button>

          <div className="flex-1 relative flex items-center">
            <div className="w-full flex items-center bg-white border border-gray-300 rounded-full py-1.5 px-4 shadow-inner focus-within:border-[#007AFF] transition-colors">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isTyping && handleSend()
                }
                placeholder="Ask Peter Lynch..."
                disabled={isTyping}
                className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-[16px] placeholder:text-gray-400 disabled:opacity-50"
              />
              <button className="text-gray-400 ml-2 hover:text-gray-600">
                <Mic size={20} fill="currentColor" />
              </button>
            </div>

            <AnimatePresence>
              {inputValue.trim() && !isTyping && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={() => handleSend()}
                  className="ml-2 bg-[#007AFF] text-white rounded-full p-1.5 shadow-sm hover:bg-[#0066D6] transition-colors"
                >
                  <ArrowUp size={18} strokeWidth={3} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `,
        }}
      />
    </div>
  );
}
