"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; text: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Hello! I'm the Vivereply Concierge demo. Ask me anything — live booking tools arrive in step 2.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Request failed.");
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col p-4">
      <header className="border-b pb-3">
        <h1 className="text-xl font-bold">Vivereply Concierge</h1>
        <p className="text-sm text-gray-500">Demo chat — conversations now saved.</p>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
              m.role === "user"
                ? "self-end bg-black text-white"
                : "self-start bg-gray-100 text-gray-900"
            }`}
          >
            {m.text}
          </div>
        ))}
        {sending && (
          <div className="self-start rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
            Thinking…
          </div>
        )}
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex gap-2 border-t pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          className="flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </main>
  );
}
