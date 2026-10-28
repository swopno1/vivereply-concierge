// Staff iframe widget UI (P3). Client component rendered bare inside the
// client dashboard's iframe. Same-origin calls to /api/bridge/* carry the
// embed token (never a bridge key — keys must never reach a browser). Full
// staff loop: filter by status, read the transcript, add follow-up notes,
// assign, and close/reopen. A 401 means the 15-minute token died: the
// widget says so plainly and stops (the dashboard mints a fresh token per
// page load, so a dashboard refresh fixes it).

"use client";

import { useEffect, useState } from "react";

type Note = { id: string; author: string; body: string; createdAt: string };
type TranscriptMsg = { role: string; content: string; createdAt: string };
type Handoff = {
  id: string;
  conversationId: string;
  reason: string;
  summary: string;
  status: string;
  assignee: string | null;
  createdAt: string;
  noteCount: number;
  notes: Note[];
  transcript?: TranscriptMsg[];
};

const FILTERS = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;

export default function StaffEmbed({ token, propertyId }: { token: string; propertyId: string }) {
  const [filter, setFilter] = useState<string>("OPEN");
  const [rows, setRows] = useState<Handoff[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Handoff | null>(null);
  const [author, setAuthor] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [message, setMessage] = useState("");
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  function authHeaders(): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  async function loadList(nextFilter: string) {
    setMessage("");
    const res = await fetch(`/api/bridge/handoffs?status=${nextFilter}`, { headers: authHeaders() });
    if (res.status === 401) {
      setExpired(true);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) {
      setMessage(data?.error || "Could not load handoffs.");
      return;
    }
    setRows(data);
    setSelectedId((current) => (data.some((h: Handoff) => h.id === current) ? current : null));
    setDetail((current) => (current && data.some((h: Handoff) => h.id === current.id) ? current : null));
  }

  async function loadDetail(id: string) {
    setMessage("");
    const res = await fetch(`/api/bridge/handoffs/${id}`, { headers: authHeaders() });
    if (res.status === 401) {
      setExpired(true);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) {
      setMessage(data?.error || "Could not load this handoff.");
      return;
    }
    setSelectedId(id);
    setDetail(data);
    setAssignee(data.assignee ?? "");
  }

  useEffect(() => {
    setLoading(true);
    loadList(filter)
      .catch(() => setMessage("Could not load handoffs."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function addNote() {
    if (!detail || !author.trim() || !noteBody.trim()) {
      setMessage("Author and note text are required.");
      return;
    }
    setMessage("");
    const res = await fetch(`/api/bridge/handoffs/${detail.id}/notes`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ author: author.trim(), body: noteBody.trim() }),
    });
    if (res.status === 401) {
      setExpired(true);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error || "Could not save the note.");
      return;
    }
    setNoteBody("");
    await loadDetail(detail.id);
    await loadList(filter);
  }

  async function saveAssignment() {
    if (!detail) return;
    setMessage("");
    const res = await fetch(`/api/bridge/handoffs/${detail.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ assignee: assignee.trim() ? assignee.trim() : null }),
    });
    if (res.status === 401) {
      setExpired(true);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error || "Could not save the assignee.");
      return;
    }
    setDetail(data);
    await loadList(filter);
  }

  async function setStatus(status: string) {
    if (!detail) return;
    setMessage("");
    const res = await fetch(`/api/bridge/handoffs/${detail.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    if (res.status === 401) {
      setExpired(true);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error || "Could not update the status.");
      return;
    }
    setDetail(data);
    await loadList(filter);
  }

  if (expired) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-2 p-6">
        <p className="text-sm font-semibold">Staff session expired</p>
        <p className="text-sm text-gray-500">
          Widget links last 15 minutes. Refresh the dashboard page to get a fresh one.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center gap-3 border-b border-gray-200 pb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0C1222]">
          <img src="/brand/vivereply-mark.svg" alt="" className="h-7 w-7" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-tight">Staff handoffs</span>
          <span className="block truncate text-xs text-gray-500">{propertyId}</span>
        </span>
        <span className="ml-auto flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f ? "bg-black text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </span>
      </header>

      {message && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      )}
      {loading && <p className="text-sm text-gray-500">Loading handoffs…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-gray-500">No {filter.replace("_", " ").toLowerCase()} handoffs.</p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((h) => (
          <button
            key={h.id}
            onClick={() => loadDetail(h.id)}
            className={`rounded-xl border px-4 py-3 text-left ${
              selectedId === h.id ? "border-black" : "border-gray-200 hover:border-gray-400"
            }`}
          >
            <p className="text-sm font-semibold">{h.reason}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{h.summary}</p>
            <p className="mt-1 text-xs text-gray-500">
              {h.status.replace("_", " ")} · {h.assignee ?? "unassigned"} · {h.noteCount}{" "}
              {h.noteCount === 1 ? "note" : "notes"} · {new Date(h.createdAt).toLocaleString()}
            </p>
          </button>
        ))}
      </div>

      {detail && (
        <section className="flex flex-col gap-3 rounded-xl border border-gray-300 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold">{detail.reason}</p>
            <span className="ml-auto flex gap-1">
              {FILTERS.filter((f) => f !== detail.status).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatus(f)}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  → {f.replace("_", " ")}
                </button>
              ))}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {(detail.transcript ?? []).map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed ${
                  m.role === "user" ? "self-end bg-black text-white" : "self-start bg-gray-100 text-gray-900"
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1 border-t border-gray-200 pt-2">
            <p className="text-xs font-semibold text-gray-500">Follow-up notes</p>
            {detail.notes.length === 0 && (
              <p className="text-sm text-gray-500">No notes yet.</p>
            )}
            {detail.notes.map((n) => (
              <p key={n.id} className="text-sm text-gray-700">
                <span className="font-medium">{n.author}:</span> {n.body}
              </p>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-gray-200 pt-2">
            <div className="flex gap-2">
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className="w-36 shrink-0 rounded-full border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-black"
              />
              <input
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNote()}
                placeholder="Add a follow-up note…"
                className="min-w-0 flex-1 rounded-full border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-black"
              />
              <button
                onClick={addNote}
                className="shrink-0 rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white"
              >
                Add
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveAssignment()}
                placeholder="Assignee (empty clears)"
                className="min-w-0 flex-1 rounded-full border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-black"
              />
              <button
                onClick={saveAssignment}
                className="shrink-0 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
              >
                Assign
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
