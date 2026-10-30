// Chatbot identity editor (owner self-service). Renames the chatbot and
// flips suggestion segments without re-running ingestion — PATCHes
// /api/admin/profile, which upserts the PropertyProfile row. The name
// shows in the widget header + greeting; segments gate advice topics in
// the system prompt (grounded-only, never general knowledge).
"use client";

import { useState } from "react";
import { SUGGESTION_SEGMENTS } from "@/lib/segments";

export type ChatbotProfileInitial = {
  assistantName: string;
  greeting: string;
  tone: string;
  suggestionSegments: string[];
};

export default function ChatbotProfile({
  initial,
  propertyId,
}: {
  initial: ChatbotProfileInitial;
  propertyId: string;
}) {
  const [name, setName] = useState(initial.assistantName);
  const [greeting, setGreeting] = useState(initial.greeting);
  const [tone, setTone] = useState(initial.tone);
  const [segments, setSegments] = useState<string[]>(initial.suggestionSegments);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function save() {
    if (sending) return;
    setMessage("");
    setSending(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          assistantName: name,
          greeting,
          tone,
          suggestionSegments: segments,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setName(data.assistantName ?? "");
      setGreeting(data.greeting ?? "");
      setTone(data.tone ?? "");
      setSegments(Array.isArray(data.suggestionSegments) ? data.suggestionSegments : []);
      setMessage("Saved — the widget picks it up on the next load.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Chatbot name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Aria (blank = Vivereply Concierge)"
          maxLength={100}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Greeting line
        <input
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="First line guests see (optional)"
          maxLength={500}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Tone
        <input
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="e.g. warm, short replies"
          maxLength={500}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
        />
      </label>
      <fieldset>
        <legend className="text-sm text-gray-700">Suggestion topics (grounded in your documents only)</legend>
        <div className="mt-1 flex flex-col gap-1">
          {SUGGESTION_SEGMENTS.map((s) => {
            const on = segments.includes(s.id);
            return (
              <label key={s.id} className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={on}
                  onChange={() =>
                    setSegments(on ? segments.filter((x) => x !== s.id) : [...segments, s.id])
                  }
                />
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-gray-500"> — {s.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={sending}
          className="self-start rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {sending ? "Saving…" : "Save"}
        </button>
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </div>
    </div>
  );
}
