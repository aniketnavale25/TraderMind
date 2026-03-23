import React, { useState, useRef, useEffect } from "react";
import {
  Video,
  Plus,
  Mic,
  ArrowUp,
  Search,
  Edit,
  MessageSquare,
  User,
  Briefcase,
  Users,
  Archive,
  MessageCircle,
  X,
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
  sender: "me" | "them";
  timestamp: Date;
  status?: "delivered" | "read";
}

interface HistoryEntry {
  user: string;
  assistant: string;
}

interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread?: boolean;
  online?: boolean;
  initials?: string;
  color?: string;
  suggestions?: string[];
  welcomeMessage?: string;
}

// ── Contacts (4 traders) ──────────────────────────────────────
const CONTACTS: Contact[] = [
  {
    id: "lynch",
    name: "Peter Lynch",
    avatar: "/PL.jpeg",
    lastMessage: "Ask me anything about investing and stock picking.",
    time: "Now",
    online: true,
    initials: "PL",
    color: "bg-gradient-to-br from-[#1d6fa4] to-[#007AFF]",
    welcomeMessage:
      "Hi! I'm Peter Lynch — former manager of Fidelity Magellan. Ask me anything about investing, stock picking, or my philosophy. 📈",
    suggestions: [
      "What is your approach to picking stocks?",
      "How do you think about the PEG ratio?",
      "What is diworseification?",
      "How do you manage risk?",
    ],
  },
  {
    id: "buffett",
    name: "Warren Buffett",
    avatar: "",
    lastMessage: "Ask me about value investing and long-term thinking.",
    time: "Now",
    online: true,
    initials: "WB",
    color: "bg-gradient-to-br from-[#c8a96e] to-[#8B6914]",
    welcomeMessage:
      "Hello! I'm Warren Buffett — Chairman of Berkshire Hathaway. Ask me about value investing, business quality, or long-term thinking. 📊",
    suggestions: [
      "What makes a great business?",
      "How do you value a company?",
      "What is your circle of competence?",
      "How do you think about risk?",
    ],
  },
  {
    id: "soros",
    name: "George Soros",
    avatar: "",
    lastMessage: "Ask me about macro investing and reflexivity.",
    time: "Now",
    online: true,
    initials: "GS",
    color: "bg-gradient-to-br from-[#d62828] to-[#9b1b1b]",
    welcomeMessage:
      "Hello. I'm George Soros — founder of Soros Fund Management. Ask me about macro investing, reflexivity, or global markets. 🌍",
    suggestions: [
      "What is reflexivity theory?",
      "How do you approach macro investing?",
      "How did you break the Bank of England?",
      "How do you manage risk in global markets?",
    ],
  },
  {
    id: "livermore",
    name: "Jesse Livermore",
    avatar: "",
    lastMessage: "Ask me about trading psychology and speculation.",
    time: "Now",
    online: true,
    initials: "JL",
    color: "bg-gradient-to-br from-[#f77f00] to-[#d62828]",
    welcomeMessage:
      "Hello. I'm Jesse Livermore — one of the greatest speculators of my era. Ask me about trading, timing the market, or the psychology of speculation. 📉",
    suggestions: [
      "How do you time the market?",
      "What is the most important rule in trading?",
      "How do you handle losing streaks?",
      "What role does patience play in trading?",
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────
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
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, selectedContact]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setError(null);
    setMessages([
      {
        id: "1",
        text:
          contact.welcomeMessage ||
          `Hi! I'm ${contact.name}. How can I help you?`,
        sender: "them",
        timestamp: new Date(),
      },
    ]);
  };

  // ── Send message ────────────────────────────────────────────
  const handleSend = async (text?: string) => {
    const q = (text ?? inputValue).trim();
    if (!q || !selectedContact) return;

    setError(null);
    setInputValue("");

    const userMsg: Message = {
      id: Date.now().toString(),
      text: q,
      sender: "me",
      timestamp: new Date(),
      status: "delivered",
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const history = buildHistory([...messages, userMsg]);
      // ← passes selectedContact.id to backend
      const answer = await sendMessage(q, history, selectedContact.id);

      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: answer,
          sender: "them",
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setIsTyping(false);
      setError(
        "Could not reach the backend. Make sure the Python API is running.",
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsg.id ? { ...m, status: undefined } : m,
        ),
      );
    }
  };

  const showSuggestions = messages.length === 1;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f9f9fe] text-[#1a1c1f]">
      {/* SideNavBar */}
      <aside className="hidden md:flex h-screen w-20 lg:w-72 rounded-r-[3rem] bg-[#f3f3f8] flex-col py-8 px-4 lg:px-6 space-y-8 shadow-[0_10px_40px_rgba(26,28,31,0.06)] z-10 font-['Inter'] antialiased tracking-tight transition-all duration-300">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-gradient-to-br from-[#1d6fa4] to-[#007AFF] flex items-center justify-center text-white font-bold text-sm border-2 border-white shadow-sm">
              TM
            </div>
            <button className="hidden lg:flex w-10 h-10 rounded-full bg-white items-center justify-center text-[#0058bc] transition-transform active:scale-90 shadow-sm">
              <Edit size={20} />
            </button>
          </div>
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold tracking-tighter text-[#1a1c1f]">
              TraderMind
            </h1>
            <p className="text-xs text-[#626267] opacity-70">
              Learn from the legends
            </p>
          </div>
        </div>

        <nav className="flex flex-col space-y-2 flex-grow">
          <div className="bg-white text-[#0058bc] rounded-2xl shadow-sm font-semibold flex items-center px-3 lg:px-4 py-3 gap-3">
            <MessageSquare size={20} />
            <span className="hidden lg:block">All Traders</span>
          </div>
          <div className="text-[#626267] hover:bg-white/50 hover:text-[#1a1c1f] transition-all duration-300 rounded-2xl flex items-center px-3 lg:px-4 py-3 gap-3">
            <User size={20} />
            <span className="hidden lg:block">Value Investors</span>
          </div>
          <div className="text-[#626267] hover:bg-white/50 hover:text-[#1a1c1f] transition-all duration-300 rounded-2xl flex items-center px-3 lg:px-4 py-3 gap-3">
            <Briefcase size={20} />
            <span className="hidden lg:block">Macro Traders</span>
          </div>
          <div className="text-[#626267] hover:bg-white/50 hover:text-[#1a1c1f] transition-all duration-300 rounded-2xl flex items-center px-3 lg:px-4 py-3 gap-3">
            <Users size={20} />
            <span className="hidden lg:block">Speculators</span>
          </div>
          <div className="text-[#626267] hover:bg-white/50 hover:text-[#1a1c1f] transition-all duration-300 rounded-2xl flex items-center px-3 lg:px-4 py-3 gap-3">
            <Archive size={20} />
            <span className="hidden lg:block">Archived</span>
          </div>
        </nav>
      </aside>

      {/* Contact List */}
      <section
        className={cn(
          "w-full md:w-1/2 flex flex-col bg-[#f9f9fe] border-r border-gray-100",
          selectedContact && "hidden md:flex",
        )}
      >
        <header className="w-full h-20 sticky top-0 z-50 bg-[#f9f9fe]/80 backdrop-blur-xl flex items-center justify-between px-6 border-none font-['Inter'] text-sm font-medium">
          <div className="flex items-center gap-4 flex-grow">
            <div className="relative w-full">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#626267] opacity-50"
              />
              <input
                className="w-full bg-[#f3f3f8] border-none rounded-full py-2.5 pl-11 pr-4 focus:ring-2 focus:ring-[#0058bc]/20 placeholder:text-[#626267]/50 text-sm"
                placeholder="Search traders..."
                type="text"
              />
            </div>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto no-scrollbar px-6 pb-8">
          <div className="space-y-2">
            {CONTACTS.map((contact) => (
              <div
                key={contact.id}
                onClick={() => handleSelectContact(contact)}
                className={cn(
                  "group relative p-4 bg-white rounded-xl shadow-[0_4px_20px_rgba(26,28,31,0.04)] transition-all duration-300 flex items-center gap-4 cursor-pointer hover:bg-[#f3f3f8]",
                  selectedContact?.id === contact.id &&
                    "bg-[#f3f3f8] ring-1 ring-[#0058bc]/10",
                )}
              >
                <div className="relative flex-shrink-0">
                  {contact.avatar ? (
                    <img
                      alt={contact.name}
                      className="w-12 h-12 rounded-full object-cover"
                      src={contact.avatar}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg",
                        contact.color || "bg-[#0058bc]",
                      )}
                    >
                      {contact.initials}
                    </div>
                  )}
                  {contact.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                  )}
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className="text-sm font-bold tracking-tight text-[#1a1c1f] truncate">
                      {contact.name}
                    </h3>
                    <span className="text-[10px] font-semibold flex-shrink-0 ml-2 text-[#626267]">
                      {contact.time}
                    </span>
                  </div>
                  <p className="text-xs truncate text-[#626267]">
                    {contact.lastMessage}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chat Pane */}
      <section
        className={cn(
          "flex flex-col bg-white relative",
          selectedContact ? "w-full md:w-1/2" : "hidden md:flex md:w-1/2",
        )}
      >
        <AnimatePresence mode="wait">
          {selectedContact ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col h-full w-full"
            >
              {/* Chat Header */}
              <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur-xl border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full overflow-hidden flex items-center justify-center",
                      selectedContact.color ||
                        "bg-gradient-to-br from-[#1d6fa4] to-[#007AFF]",
                    )}
                  >
                    {selectedContact.avatar ? (
                      <img
                        src={selectedContact.avatar}
                        alt={selectedContact.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-sm font-bold">
                        {selectedContact.initials ||
                          selectedContact.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-black/90">
                      {selectedContact.name}
                    </span>
                    {selectedContact.online && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
                        <span className="text-[10px] text-[#34c759] font-medium">
                          Active now
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button className="text-[#007AFF] hover:opacity-70 transition-opacity">
                    <Video size={20} fill="currentColor" />
                  </button>
                  <button
                    onClick={() => setSelectedContact(null)}
                    className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </header>

              {/* Messages */}
              <main
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar scroll-smooth bg-[#fcfcff]"
              >
                <div className="flex flex-col items-center mb-8">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                    TraderMind
                  </p>
                  <p className="text-[10px] font-semibold text-gray-400">
                    Today {formatTime(new Date())}
                  </p>
                </div>

                <div className="flex flex-col space-y-1">
                  {messages.map((msg, index) => {
                    const isMe = msg.sender === "me";
                    const nextMsg = messages[index + 1];
                    const isLastInGroup =
                      !nextMsg || nextMsg.sender !== msg.sender;

                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className={cn(
                          "flex flex-col max-w-[85%]",
                          isMe
                            ? "self-end items-end"
                            : "self-start items-start",
                          isLastInGroup ? "mb-4" : "mb-0.5",
                        )}
                      >
                        <div
                          className={cn(
                            "px-4 py-2.5 text-[15px] leading-relaxed shadow-sm",
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
                        {isLastInGroup && (
                          <span className="text-[10px] text-gray-400 mt-1 px-1">
                            {formatTime(msg.timestamp)}
                            {isMe && msg.status && (
                              <span className="ml-1 font-semibold capitalize">
                                • {msg.status}
                              </span>
                            )}
                          </span>
                        )}
                      </motion.div>
                    );
                  })}

                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1.5 px-4 py-3 bg-[#E9E9EB] rounded-full w-fit mt-2 self-start"
                    >
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    </motion.div>
                  )}

                  {error && (
                    <div className="text-[11px] text-red-500 bg-red-50 rounded-xl px-4 py-2 mt-4 text-center border border-red-100">
                      ⚠️ {error}
                    </div>
                  )}

                  {/* Suggested questions — unique per trader */}
                  {showSuggestions && selectedContact.suggestions && (
                    <div className="mt-6 flex flex-col gap-2">
                      <p className="text-[10px] text-gray-400 text-center uppercase tracking-widest font-bold mb-2">
                        Suggested
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {selectedContact.suggestions.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(q)}
                            className="text-[13px] text-[#007AFF] bg-white border border-[#007AFF]/20 rounded-full px-4 py-2 hover:bg-[#007AFF] hover:text-white transition-all duration-200 shadow-sm"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </main>

              {/* Input Bar */}
              <footer className="px-6 py-6 bg-white border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <button className="text-gray-400 hover:text-[#007AFF] transition-colors p-1">
                    <Plus size={24} />
                  </button>
                  <div className="flex-1 relative flex items-center">
                    <div className="w-full flex items-center bg-[#f3f3f8] border border-transparent rounded-full py-2 px-4 focus-within:bg-white focus-within:border-[#007AFF]/30 transition-all">
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && !isTyping && handleSend()
                        }
                        placeholder={`Ask ${selectedContact.name}...`}
                        disabled={isTyping}
                        className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm placeholder:text-gray-400 disabled:opacity-50"
                      />
                      <button className="text-gray-400 ml-2 hover:text-[#007AFF]">
                        <Mic size={18} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {inputValue.trim() && !isTyping && (
                        <motion.button
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          onClick={() => handleSend()}
                          className="ml-2 bg-[#007AFF] text-white rounded-full p-2 shadow-lg shadow-[#007AFF]/20 hover:bg-[#0066D6] transition-colors"
                        >
                          <ArrowUp size={18} strokeWidth={3} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </footer>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full p-12 text-center bg-white"
            >
              <div className="w-24 h-24 rounded-3xl bg-[#f3f3f8] flex items-center justify-center mb-8 shadow-inner">
                <MessageCircle size={48} className="text-[#0058bc]/20" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tighter mb-4">
                TraderMind
              </h2>
              <p className="text-[#626267] text-sm leading-relaxed max-w-xs">
                Select a legendary investor from the list and start learning
                from the best minds in trading history.
              </p>
              <div className="mt-12 flex flex-wrap justify-center gap-3">
                {CONTACTS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectContact(c)}
                    className={cn(
                      "px-4 py-2 rounded-full text-[11px] font-bold text-white uppercase tracking-wider",
                      c.color || "bg-[#0058bc]",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <style
        dangerouslySetInnerHTML={{
          __html: `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`,
        }}
      />
    </div>
  );
}
