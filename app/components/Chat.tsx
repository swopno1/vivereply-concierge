"use client";

// Shared chat UI (step 4 refactor, token-carrying since step 4.5).
// The main page (/) and the widget page (/widget) render the SAME
// component, so a guest sees the same chat whether they open the demo
// directly or through an embedded widget on another site. Compact mode
// (widget) hides the staff link and uses the widget property's title;
// everything else — messages, cards, language, tools — is identical.
//
// The token (issued server-side by / or by the widget handshake) is
// sent with every /api/chat call, and the API trusts ONLY the token's
// propertyId. The browser never sends a propertyId anymore: a widget
// token still does NOT switch the Suite catalogue or database in v1
// (single demo property) — it only labels the conversation and gates
// which site may host the chat. Multi-property routing is future
// work, not something this prop pretends to do.
//
// Waiting states: /api/chat streams REAL phases, so the status line is
// never faked — "Thinking…" while the model reasons, "Checking…" with
// a one-line detail while a live resort check runs, then the reply
// types itself out word by word. The input stays open while a reply is
// in flight: a follow-up is shown immediately, marked waiting, and sent
// automatically when the current reply finishes (it never interrupts
// the in-flight turn, which would corrupt the single-conversation
// booking guards). Tapping a typing reply shows the full text at once.
// Cards appear only once typing completes, so a quote or draft never
// pops in before the sentence that explains it.

import { useEffect, useRef, useState } from "react";

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

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: Card[];
  pending?: boolean;
  typing?: boolean;
};

type Phase = "idle" | "checking" | "thinking" | "typing";

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
  title,
  token,
  source,
}: {
  compact?: boolean;
  title?: string;
  token: string;
  source: "direct" | "widget";
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "greeting",
      role: "assistant",
      text: "Hello! I'm the Vivereply Concierge. Ask about rooms, prices, check-in, or anything about your stay.",
    },
  ]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseDetail, setPhaseDetail] = useState("");
  const [reassurance, setReassurance] = useState("");
  const [error, setError] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
  const idCounter = useRef(0);
  const busyRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const queueRef = useRef<Array<{ id: string; text: string }>>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const skipTypingRef = useRef<(() => void) | null>(null);

  const nextId = () => `m${++idCounter.current}`;

  // Follow the conversation down only while the guest is already near
  // the bottom — never yank them out of history they scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, phase, phaseDetail, reassurance]);

  function startNextFromQueue() {
    const next = queueRef.current[0];
    if (!next || busyRef.current) return;
    queueRef.current = queueRef.current.slice(1);
    setQueuedCount(queueRef.current.length);
    setMessages((m) => m.map((msg) => (msg.id === next.id ? { ...msg, pending: false } : msg)));
    void runTurn(next.text);
  }

  function typewrite(fullText: string, cards: Card[]): Promise<void> {
    return new Promise((resolve) => {
      const id = nextId();
      setMessages((m) => [...m, { role: "assistant", text: "", cards, id, typing: true }]);
      const words = fullText.split(" ");
      // Chunked so a long reply still finishes in ~3 seconds; a short
      // reply types at a natural word-by-word pace.
      const chunk = Math.max(1, Math.ceil(words.length / 36));
      let shown = 0;
      let timer: ReturnType<typeof setInterval> | null = null;
      const finish = () => {
        if (timer) clearInterval(timer);
        timer = null;
        skipTypingRef.current = null;
        setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text: fullText, typing: false } : msg)));
        resolve();
      };
      timer = setInterval(() => {
        shown = Math.min(words.length, shown + chunk);
        const text = words.slice(0, shown).join(" ");
        setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text } : msg)));
        if (shown >= words.length) finish();
      }, 90);
      skipTypingRef.current = finish;
    });
  }

  async function runTurn(text: string) {
    busyRef.current = true;
    setPhase("thinking");
    setPhaseDetail("");
    setReassurance("");
    setError("");
    // Patience line: only after a genuinely long wait, and only once —
    // a rotating spinner of reassurances would feel more robotic, not less.
    const reassureTimer = setTimeout(() => {
      setReassurance("Still working on it — live resort checks can take a few seconds.");
    }, 12000);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: conversationIdRef.current, token, source }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Request failed.");
      }
      const contentType = res.headers.get("content-type") ?? "";
      let reply: string | null = null;
      let cards: Card[] = [];
      let newConversationId: string | null = null;
      if (!res.body || !contentType.includes("text/event-stream")) {
        // Fallback to the old JSON contract (deploy transition window).
        const data = await res.json().catch(() => null);
        if (!data || typeof data.reply !== "string") throw new Error("Request failed.");
        reply = data.reply;
        cards = Array.isArray(data.cards) ? (data.cards as Card[]) : [];
        newConversationId = typeof data.conversationId === "string" ? data.conversationId : null;
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;
        while (!finished) {
          const { value, done } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = buffer.indexOf("\n\n")) >= 0) {
              const chunk = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              for (const line of chunk.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                let event: {
                  type?: string;
                  phase?: string;
                  detail?: string;
                  reply?: string;
                  cards?: unknown;
                  conversationId?: string;
                  error?: string;
                };
                try {
                  event = JSON.parse(line.slice(6));
                } catch {
                  continue;
                }
                if (event.type === "phase") {
                  setPhase(event.phase === "checking" ? "checking" : "thinking");
                  setPhaseDetail(typeof event.detail === "string" ? event.detail : "");
                } else if (event.type === "done") {
                  reply = typeof event.reply === "string" ? event.reply : "";
                  cards = Array.isArray(event.cards) ? (event.cards as Card[]) : [];
                  newConversationId = typeof event.conversationId === "string" ? event.conversationId : null;
                  finished = true;
                } else if (event.type === "error") {
                  throw new Error(event.error || "Request failed.");
                }
              }
            }
          }
          if (done) break;
        }
        if (reply === null) throw new Error("The connection closed before a reply arrived.");
      }
      if (newConversationId) conversationIdRef.current = newConversationId;
      clearTimeout(reassureTimer);
      setReassurance("");
      setPhase("typing");
      await typewrite(reply ?? "", cards);
    } catch (e) {
      clearTimeout(reassureTimer);
      setReassurance("");
      setPhase("idle");
      busyRef.current = false;
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return;
    }
    setPhase("idle");
    busyRef.current = false;
    startNextFromQueue();
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = nextId();
    setMessages((m) => [...m, { role: "user", text: trimmed, id }]);
    if (busyRef.current) {
      queueRef.current = [...queueRef.current, { id, text: trimmed }];
      setQueuedCount(queueRef.current.length);
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, pending: true } : msg)));
      return;
    }
    void runTurn(trimmed);
  }

  function handleSend() {
    const text = input.trim();
    if (text) {
      setInput("");
      submit(text);
      return;
    }
    // Empty input + a queued message = retry the queued message (after an error).
    startNextFromQueue();
  }

  const busy = phase !== "idle";

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

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex flex-1 flex-col gap-3 overflow-y-auto py-4"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex max-w-[80%] flex-col gap-2 ${m.role === "user" ? "self-end items-end" : "self-start items-start"}`}
          >
            <div
              onClick={() => {
                if (m.typing) skipTypingRef.current?.();
              }}
              title={m.typing ? "Tap to show the full reply" : undefined}
              className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "bg-black text-white" : "bg-gray-100 text-gray-900"
              } ${m.typing ? "cursor-pointer" : ""}`}
            >
              {m.text}
              {m.typing && <span className="animate-pulse">▍</span>}
            </div>
            {m.typing && <p className="text-xs text-gray-400">Tap to show the full reply</p>}
            {m.pending && <p className="text-xs text-gray-400">Waiting…</p>}
            {!m.typing && (m.cards ?? []).map((card, j) => <CardView key={j} card={card} />)}
          </div>
        ))}
        {(phase === "checking" || phase === "thinking") && (
          <div
            aria-live="polite"
            className="self-start rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500"
          >
            <span>
              {phase === "checking" ? "Checking…" : "Thinking…"}
              <span className="ml-1 inline-flex gap-1 align-middle">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>
                  .
                </span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>
                  .
                </span>
              </span>
            </span>
            {phaseDetail && <span className="block text-xs text-gray-500">{phaseDetail}</span>}
            {reassurance && <span className="block text-xs italic text-gray-500">{reassurance}</span>}
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
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={busy ? "Type a follow-up — I'll send it next…" : "Type a message…"}
          className="flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() && queuedCount === 0}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </main>
  );
}
