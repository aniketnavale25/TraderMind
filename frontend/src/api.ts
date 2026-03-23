const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface Message {
  user: string;
  assistant: string;
}

export async function sendMessage(
  question: string,
  history: Message[] = [],
  traderId: string = "lynch"
): Promise<string> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trader_id: traderId,
      question,
      history,
    }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.answer;
}