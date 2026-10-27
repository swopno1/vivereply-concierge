"use client";

// Shared chat UI (step 4 refactor). The main page (/) and the widget
// page (/widget) render the SAME component, so a guest sees the same
// chat whether they open the demo directly or through an embedded
// widget on another site. Compact mode (widget) hides the staff link
// and uses the widget property's title; everything else — messages,
// cards, language, tools — is identical.
//
// propertyId, when given, is sent to /api/chat and stored as the new
// conversation's label. In v1 it does NOT switch the Suite catalogue
// or database (single demo property): the tools still use the demo
// catalogue and SUITE_API_BASE_URL. Multi-property routing is future
// work, not something this prop pretends to do.

import { useState } from "react";

type Card =
  | {
      kind: "quote";
      room: string;
      checkIn: string;
      checkOut: string;
      nights: number;
      total: string;
      available: number;
    }
  | {
      kind: "draft";
      room: string;
      checkIn: string;
      checkOut: string;
      bookingCode: string;
      suiteTotal: string;
      quotedTotal: string;
      totalsMatch: boolean;
    }
  | { kind: "handoff"; reason: string; summary: string };

type Message = { role: "user" | "assistant"; text: string; cards?: Card[] };

function CardView({ card }: { card: Card }) {
  if (card.kind === "quote") {
    return (
      <div className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm">
        <p className="font-semibold">Quote — {card.room}</p>
        <p className="text-gray-700">
          {card.checkIn} → {card.checkOut} · {card.nights} night{card.nights === 1 ? "" : "s"} ·{" "}
          {card.available} available
        </p>
        <p className="font-semibold">Total: {card.total}</p>
      </div>
    );
  }
  if (card.kind === "draft") {
    return (
      <div className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm">
        <p className="font-semibold">Booking draft held — {card.room}</p>
        <p className="text-gray-700">
          {card.checkIn} → {card.checkOut}
        </p>
        <p>
          Booking code: <span className="font-mono font-semibold">{card.bookingCode}</span>
        </p>
        <p>Total: {card.suiteTotal}</p>
        {!card.totalsMatch && (
          <p className="text-amber-700">
            Note: the Suite total ({card.suiteTotal}) governs — it differs from the quoted{" "}
            {card.quotedTotal}.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm">
      <p className="font-semibold">Passed to staff</p>
      <p className="text-gray-700">{card.reason}</p>
      <p className="text-gray-700">{card.summary}</p>
    </div>
  );
}

export default function Chat({
  compact = false,
  propertyId,
  title,
}: {
  compact?: boolean;
  propertyId?: string;
  title?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Hello! I'm the Vivereply Concierge. Ask about rooms, prices, check-in, or anything about your stay.",
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
        body: JSON.stringify({ message: text, conversationId, propertyId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Request failed.");
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.reply, cards: Array.isArray(data.cards) ? data.cards : [] },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main
      className={
        compact
          ? "mx-auto flex min-h-screen w-full flex-col p-3"
          : "mx-auto flex min-h-screen max-w-2xl flex-col p-4"
      }
    >
      <header className="border-b pb-3">
        <h1 className="text-xl font-bold">{compact && title ? title : "Vivereply Concierge"}</h1>
        <p className="text-sm text-gray-500">
          {compact ? "Ask about rooms, prices, and your stay." : "Demo chat — conversations now saved."}
        </p>
        {!compact && (
          <p className="text-sm">
            <a href="/staff" className="underline">
              Staff view (handoffs)
            </a>
          </p>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex max-w-[80%] flex-col gap-2 ${m.role === "user" ? "self-end items-end" : "self-start items-start"}`}>
            <div
              className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "bg-black text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              {m.text}
            </div>
            {(m.cards ?? []).map((card, j) => (
              <CardView key={j} card={card} />
            ))}
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
