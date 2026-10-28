"use client";

// Shared chat pane — the conversation only. On the web app (/) the
// app/(shell)/layout.tsx sidebar wraps this component; the widget
// (/widget panel) renders it bare with its own header. The shell's New
// chat button reaches this component through a window event (see
// AppShell.NEW_CHAT_EVENT); the reset is refused while a reply is in
// flight, so an in-turn reset can never orphan state updates.
//
// Waiting states: /api/chat streams REAL phases — "Thinking…" while the
// model reasons, "Checking…" with a one-line detail while a live resort
// check runs, then the reply types itself out word by word. The input
// stays open while a reply is in flight: a follow-up is shown
// immediately, marked waiting, and sent automatically when the current
// reply finishes (it never interrupts the in-flight turn, which would
// corrupt the single-conversation booking guards). Tapping a typing reply
// shows the full text at once. Cards appear only once typing completes,
// so a quote or draft never pops in before the sentence that explains it.
// Visitors who prefer reduced motion get the full reply instantly.

import { useEffect, useRef, useState } from "react";
import { NEW_CHAT_EVENT } from "./AppShell";

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

const GREETING =
  "Hello! I'm the Vivereply Concierge. Ask about rooms, prices, check-in, or anything about your stay.";

const SUGGESTIONS = [
  "Sea-facing room for 2 nights in November",
  "ব্যাম্বু কটেজ ৪ থেকে ৬ নভেম্বর খালি আছে কি?",
  "I need help from a person",
];

function CardView({ card }: { card: Card }) {
  if (card.kind === "quote") {
    return (
      <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Quote — {card.room}</p>
        <p className="mt-0.5 text-sm text-gray-700">
          {card.checkIn} → {card.checkOut} · {card.nights} night{card.nights === 1 ? "" : "s"} ·{" "}
          {card.available} available
        </p>
        <p className="mt-1 text-base font-bold text-gray-900">Total: {card.total}</p>
      </div>
    );
  }
  if (card.kind === "draft") {
    return (
      <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Booking draft held — {card.room}</p>
        <p className="mt-0.5 text-sm text-gray-700">
          {card.checkIn} → {card.checkOut}
        </p>
        <p className="mt-1 text-sm text-gray-900">
          Booking code:{" "}
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono font-semibold">
            {card.bookingCode}
          </span>
        </p>
        <p className="mt-1 text-base font-bold text-gray-900">Total: {card.suiteTotal}</p>
        {!card.totalsMatch && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Note: the Suite total ({card.suiteTotal}) governs — it differs from the quoted{" "}
            {card.quotedTotal}.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">Passed to staff</p>
      <p className="mt-0.5 text-sm text-gray-700">{card.reason}</p>
      <p className="mt-0.5 text-sm text-gray-700">{card.summary}</p>
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
    { id: "greeting", role: "assistant", text: GREETING },
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

  function newChat() {
    // Reset to a fresh conversation. Refused while a reply is in flight:
    // resetting mid-turn would orphan the turn's state updates.
    if (busyRef.current) return;
    queueRef.current = [];
    setQueuedCount(0);
    conversationIdRef.current = null;
    setMessages([{ id: "greeting", role: "assistant", text: GREETING }]);
    setInput("");
    setPhase("idle");
    setPhaseDetail("");
    setReassurance("");
    setError("");
  }

  // The shell sidebar's New chat button dispatches this; the widget has
  // no shell, so the listener simply never fires there.
  useEffect(() => {
    const reset = () => newChat();
    window.addEventListener(NEW_CHAT_EVENT, reset);
    return () => window.removeEventListener(NEW_CHAT_EVENT, reset);
  }, []);

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
      // Reduced motion: show the full reply at once, no typing effect.
      if (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setMessages((m) => [...m, { role: "assistant", text: fullText, cards, id }]);
        resolve();
        return;
      }
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
  const showSuggestions = messages.length <= 1 && phase === "idle" && !error;

  // Desktop web constrains the reading column; the narrow widget uses full width.
  const columnWidth = compact ? "w-full" : "mx-auto w-full max-w-3xl";

  return (
    <main
      className={
        compact
          ? "mx-auto flex h-screen w-full flex-col bg-white font-sans text-gray-900 antialiased"
          : "flex h-full w-full flex-col bg-white font-sans text-gray-900 antialiased"
      }
    >
      {compact && (
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-tight">
              {title ?? "Vivereply Concierge"}
            </span>
            <span className="block truncate text-xs text-gray-500">
              Ask about rooms, prices, and your stay.
            </span>
          </span>
        </header>
      )}

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex flex-1 flex-col overflow-y-auto px-4 py-6"
      >
        <div className={`flex flex-col gap-6 ${columnWidth}`}>
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-gray-100 px-5 py-2.5 text-[15px] leading-7 text-gray-900">
                  {m.text}
                </div>
                {m.pending && <p className="text-xs text-gray-500">Waiting…</p>}
              </div>
            ) : (
              <div key={m.id} className="flex flex-col items-start gap-2">
                <div
                  onClick={() => {
                    if (m.typing) skipTypingRef.current?.();
                  }}
                  title={m.typing ? "Tap to show the full reply" : undefined}
                  className={`w-full whitespace-pre-wrap text-[15px] leading-7 text-gray-900 ${m.typing ? "cursor-pointer" : ""}`}
                >
                  {m.text}
                  {m.typing && <span className="motion-safe:animate-pulse">▍</span>}
                </div>
                {m.typing && <p className="text-xs text-gray-500">Tap to show the full reply</p>}
                {!m.typing && (m.cards ?? []).map((card, j) => <CardView key={j} card={card} />)}
              </div>
            )
          )}
          {(phase === "checking" || phase === "thinking") && (
            <div aria-live="polite" className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-flex gap-1">
                <span className="motion-safe:animate-bounce">.</span>
                <span className="motion-safe:animate-bounce" style={{ animationDelay: "150ms" }}>
                  .
                </span>
                <span className="motion-safe:animate-bounce" style={{ animationDelay: "300ms" }}>
                  .
                </span>
              </span>
              <span>
                {phase === "checking" ? "Checking…" : "Thinking…"}
                {phaseDetail && <span className="text-gray-500"> — {phaseDetail}</span>}
              </span>
              {reassurance && <span className="italic">{reassurance}</span>}
            </div>
          )}
          {showSuggestions && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className={`px-4 ${columnWidth}`}>
          <p className="mb-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="border-t border-gray-200 bg-white px-4 pb-3 pt-3">
        <div className={columnWidth}>
          <div className="flex items-end gap-2 rounded-[28px] border border-gray-300 bg-white px-2 py-2 shadow-sm focus-within:border-gray-500">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={busy ? "Type a follow-up — I'll send it next…" : "Message the Concierge…"}
              aria-label="Message the Concierge"
              className="flex-1 bg-transparent px-3 py-2 text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() && queuedCount === 0}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">
            The Concierge answers from live resort data — staff confirm every booking.
          </p>
        </div>
      </div>
    </main>
  );
}
