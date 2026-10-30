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
  | { kind: "handoff"; reason: string; summary: string }
  | {
      kind: "payment";
      bookingCode: string;
      amount: string;
      methodLabel: string;
      paymentUrl: string | null;
      expiresAt: string | null;
      status: "pending" | "paid" | "expired" | "canceled";
      paidAt: string | null;
    };

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDay(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

// Guest-facing stay range: "Dec 1–3, 2026" for same-month stays, wider
// spans spelled out. Unparseable input falls back to the raw strings —
// a card must never render blank dates.
function formatStay(checkIn: string, checkOut: string): string {
  const a = parseDay(checkIn);
  const b = parseDay(checkOut);
  if (!a || !b) return `${checkIn} → ${checkOut}`;
  const ma = MONTHS[a.m - 1];
  const mb = MONTHS[b.m - 1];
  if (a.y === b.y && a.m === b.m) return `${ma} ${a.d}–${b.d}, ${a.y}`;
  if (a.y === b.y) return `${ma} ${a.d} – ${mb} ${b.d}, ${a.y}`;
  return `${ma} ${a.d}, ${a.y} – ${mb} ${b.d}, ${b.y}`;
}

function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const area = document.createElement("textarea");
      area.value = code;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }

  return (
    <button
      onClick={copy}
      aria-label={done ? "Booking code copied" : `Copy booking code ${code}`}
      title="Tap to copy"
      className="inline-flex min-h-[44px] items-center rounded-md bg-gray-100 px-3 py-1 font-mono font-semibold hover:bg-gray-200 active:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
    >
      {done ? "Copied" : code}
    </button>
  );
}

function CardView({ card }: { card: Card }) {
  if (card.kind === "quote") {
    return (
      <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Quote — {card.room}</p>
        <p className="mt-0.5 text-sm text-gray-700">
          {formatStay(card.checkIn, card.checkOut)} · {card.nights} night{card.nights === 1 ? "" : "s"} ·{" "}
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
          {formatStay(card.checkIn, card.checkOut)}
        </p>
        <p className="mt-1 text-sm text-gray-900">
          Booking code: <CopyCode code={card.bookingCode} />
        </p>
        <p className="mt-1 text-base font-bold text-gray-900">Total: {card.suiteTotal}</p>
        <p className="mt-1 text-sm text-gray-600">
          Held for 24 hours — pay or confirm with the resort before it releases.
        </p>
        {!card.totalsMatch && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Note: the Suite total ({card.suiteTotal}) governs — it differs from the quoted{" "}
            {card.quotedTotal}.
          </p>
        )}
      </div>
    );
  }
  if (card.kind === "payment") {
    if (card.status === "paid") {
      return (
        <div className="w-full rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-green-900">
            Payment confirmed — {card.amount}
          </p>
          <p className="mt-0.5 text-sm text-green-800">
            Booking {card.bookingCode} is secured
            {card.paidAt ? ` · paid ${new Date(card.paidAt).toLocaleString()}` : ""}. A receipt
            went to your email.
          </p>
        </div>
      );
    }
    if (card.status === "pending" && card.paymentUrl) {
      return (
        <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">
            Secure your booking — {card.amount}
          </p>
          <p className="mt-0.5 text-sm text-gray-700">
            {card.bookingCode} · {card.methodLabel}
            {card.expiresAt ? ` · pay before ${new Date(card.expiresAt).toLocaleString()}` : ""}{" "}
            or the hold releases.
          </p>
          <a
            href={card.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white"
          >
            Pay now (opens in a new tab)
          </a>
          <p className="mt-2 text-xs text-gray-500">
            Pay only through this button. We never ask for card details or codes in chat.
          </p>
        </div>
      );
    }
    return (
      <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Payment link {card.status}</p>
        <p className="mt-0.5 text-sm text-gray-700">
          Booking {card.bookingCode} · {card.amount}. Ask me for a fresh link if your hold is
          still alive.
        </p>
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
  greeting,
  token,
  source,
}: {
  compact?: boolean;
  title?: string;
  greeting?: string;
  token: string;
  source: "direct" | "widget";
}) {
  const firstLine = greeting || GREETING;
  const [messages, setMessages] = useState<Message[]>([
    { id: "greeting", role: "assistant", text: firstLine },
  ]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseDetail, setPhaseDetail] = useState("");
  const [reassurance, setReassurance] = useState("");
  const [error, setError] = useState("");
  const [failedText, setFailedText] = useState<string | null>(null);
  // Screen-reader announcer: set ONLY when a reply completes, so assistive
  // tech announces finished messages once — never per typing tick.
  const [announced, setAnnounced] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
  // State mirror of the conversation ref — the helpful-vote needs it for
  // render decisions; the ref stays the source of truth for sending.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [vote, setVote] = useState<boolean | null>(null);
  const idCounter = useRef(0);
  const busyRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
    setConversationId(null);
    setVote(null);
    setMessages([{ id: "greeting", role: "assistant", text: firstLine }]);
    setInput("");
    setPhase("idle");
    setPhaseDetail("");
    setReassurance("");
    setError("");
    setAnnounced("");
  }

  // The shell sidebar's New chat button dispatches this; the widget has
  // no shell, so the listener simply never fires there.
  useEffect(() => {
    const reset = () => newChat();
    window.addEventListener(NEW_CHAT_EVENT, reset);
    return () => window.removeEventListener(NEW_CHAT_EVENT, reset);
  }, []);

  // The embed script asks for input focus when the guest opens the panel
  // (postMessage — the host cannot reach into this frame). No origin
  // check: the only action taken is focusing our own input, which is
  // harmless no matter who asks.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown } | null;
      if (data && typeof data === "object" && data.type === "vivereply:focus-input") {
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // One vote per conversation: a fresh conversation resets the ballot.
  useEffect(() => {
    setVote(null);
  }, [conversationId]);

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
        setAnnounced(fullText);
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
        setAnnounced(fullText);
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
    setFailedText(null);
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
      if (newConversationId) {
        conversationIdRef.current = newConversationId;
        setConversationId(newConversationId);
      }
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
      // Keep the failed message so Retry resends it — without this the
      // guest's turn is silently lost and must be retyped.
      setFailedText(text);
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

  function retry() {
    // Resends the failed turn WITHOUT adding a second user bubble — the
    // original message is already on screen.
    if (!failedText || busyRef.current) return;
    const text = failedText;
    setError("");
    setFailedText(null);
    void runTurn(text);
  }

  // One-tap helpful vote, stored per conversation (upsert — the guest
  // may change their mind). Fire-and-forget: a failed save must never
  // interrupt the chat, so the UI updates optimistically and stays.
  async function castVote(helpful: boolean) {
    if (!conversationId || !token) return;
    setVote(helpful);
    await fetch("/api/chat/rating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, conversationId, helpful }),
    }).catch(() => null);
  }

  const busy = phase !== "idle";
  const showSuggestions = messages.length <= 1 && phase === "idle" && !error;
  // The ballot anchors to the latest finished reply only: voting on a
  // stale message while a new turn runs would misattribute the vote.
  const lastMessage = messages[messages.length - 1];
  const showBallot =
    phase === "idle" &&
    !error &&
    conversationId !== null &&
    lastMessage !== undefined &&
    lastMessage.role === "assistant" &&
    !lastMessage.typing &&
    lastMessage.id !== "greeting";

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
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0C1222]"
          >
            <img src="/brand/vivereply-mark.svg" alt="" className="h-6 w-6" />
          </span>
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

      <p aria-live="polite" className="sr-only">
        {announced}
      </p>
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
                {m.typing ? (
                  <button
                    type="button"
                    onClick={() => skipTypingRef.current?.()}
                    title="Tap to show the full reply"
                    aria-label="Show the full reply now"
                    className="w-full cursor-pointer whitespace-pre-wrap rounded-lg text-left text-[15px] leading-7 text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                  >
                    {m.text}
                    <span className="motion-safe:animate-pulse">▍</span>
                  </button>
                ) : (
                  <div className="w-full whitespace-pre-wrap text-[15px] leading-7 text-gray-900">
                    {m.text}
                  </div>
                )}
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
                  className="min-h-[44px] rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showBallot && (
        <div className={`px-4 ${columnWidth}`}>
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-2">
            <p className="flex-1 text-sm text-gray-600">
              {vote === null ? "Was this helpful?" : "Thanks — this helps the resort improve."}
            </p>
            <button
              type="button"
              onClick={() => void castVote(true)}
              aria-pressed={vote === true}
              aria-label="Yes, this was helpful"
              className={`min-h-[44px] rounded-full px-4 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
                vote === true ? "bg-black text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => void castVote(false)}
              aria-pressed={vote === false}
              aria-label="No, this was not helpful"
              className={`min-h-[44px] rounded-full px-4 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
                vote === false ? "bg-black text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              No
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={`px-4 ${columnWidth}`}>
          <div
            role="alert"
            className="mb-2 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-2.5"
          >
            <p className="flex-1 text-sm text-red-700">
              {error}{" "}
              {failedText
                ? "Tap Retry to send your last message again, or rephrase it below."
                : "Please try again in a moment."}
            </p>
            {failedText && (
              <button
                onClick={retry}
                aria-label="Retry last message"
                className="min-h-[44px] shrink-0 rounded-full bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-800 focus-visible:ring-offset-2 focus-visible:ring-offset-red-50"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 bg-white px-4 pb-3 pt-3">
        <div className={columnWidth}>
          <div className="flex items-end gap-2 rounded-[28px] border border-gray-300 bg-white px-2 py-2 shadow-sm focus-within:border-gray-500">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={busy ? "Type a follow-up — I'll send it next…" : "Message the Concierge…"}
              aria-label="Message the Concierge"
              autoComplete="off"
              className="flex-1 rounded-xl bg-transparent px-3 py-2 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-gray-900"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() && queuedCount === 0}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
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
          <p className="mt-2 text-center text-xs text-gray-500">
            The Concierge answers from live resort data — staff confirm every booking. Details
            you share are used only to hold your booking.{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              Privacy notice
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
