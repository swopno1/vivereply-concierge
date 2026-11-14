// Assistant unanswered list (R1): Lane A misses, newest first. Each row
// resolves once the corpus covers it. Local state only; the list is
// short-lived triage, not a second store.

"use client";

import { useState } from "react";

export interface MissRow {
  id: string;
  question: string;
  lang: string;
  propertyId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export default function UnansweredList({ initial }: { initial: MissRow[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function setResolved(id: string, resolved: boolean) {
    if (busy) return;
    setBusy(id);
    try {
      const res = await fetch("/api/admin/assistant-unanswered", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolved }),
      });
      if (!res.ok) return;
      const j = await res.json().catch(() => null);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, resolvedAt: j?.resolvedAt ?? null } : r)));
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No unanswered questions. The corpus is keeping up.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((m) => (
        <li
          key={m.id}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm ${m.resolvedAt ? "opacity-60" : ""}`}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">{m.question}</p>
            <p className="text-xs text-gray-500">
              {m.lang} · {m.propertyId ?? "brand scope"} · {m.createdAt.slice(0, 10)}
              {m.resolvedAt ? " · resolved" : ""}
            </p>
          </div>
          <button
            onClick={() => void setResolved(m.id, !m.resolvedAt)}
            disabled={busy === m.id}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50"
          >
            {m.resolvedAt ? "Reopen" : busy === m.id ? "Saving…" : "Resolve"}
          </button>
        </li>
      ))}
    </ul>
  );
}
