const API_URL = import.meta.env.VITE_API_URL;

export interface Message {
  user: string;
  assistant: string;
}

export interface ChatResponse {
  answer: string;
}

export async function sendMessage(
  question: string,
  history: Message[] = []
): Promise<string> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const data: ChatResponse = await res.json();
  return data.answer;
}