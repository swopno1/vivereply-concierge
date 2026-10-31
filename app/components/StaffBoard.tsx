"use client";

// In-app staff board (session auth, same-origin cookies). The triage loop
// the old /staff page lacked: filter by status with live counts, a compact
// list, one transcript at a time, notes, assignment, and resolve/reopen —
// the same workflow as the client-dashboard iframe, for owners working
// directly in the app. Plain-language statuses throughout: staff triage
// attention, not enum values.

import { useEffect, useState } from "react";

type Note = { id: string; author: string; body: string; createdAt: string };
type TranscriptMsg = { role: string; content: string; createdAt: string };
type DraftRef = {
  guestFirstName: string | null;
  room: string | null;
  checkIn: string | null;
  checkOut: string | null;
};
type Row = {
  id: string;
  conversationId: string;
  reason: string;
  summary: string;
  status: string;
  assignee: string | null;
  language: string;
  createdAt: string;
  noteCount: number;
  draft: DraftRef | null;
};
type Detail = Row & { notes: Note[]; transcript: TranscriptMsg[] };

const FILTERS = [
  { value: "OPEN", label: "Needs attention" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "CLOSED", label: "Resolved" },
] as const;

function statusLabel(status: string): string {
  if (status === "OPEN") return "Needs attention";
  if (status === "IN_PROGRESS") return "In progress";
  return "Resolved";
}

function dotClass(status: string): string {
  if (status === "OPEN") return "bg-amber-500";
  if (status === "IN_PROGRESS") return "bg-sky-600";
  return "bg-green-600";
}

function ageOf(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function StaffBoard({
  propertyId,
  defaultAuthor,
}: {
  propertyId: string;
  defaultAuthor: string;
}) {
  const [filter, setFilter] = useState<string>("OPEN");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [author, setAuthor] = useState(defaultAuthor);
  const [noteBody, setNoteBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadList(nextFilter: string) {
    setMessage(null);
    const res = await fetch(
      `/api/admin/handoffs?propertyId=${encodeURIComponent(propertyId)}&status=${nextFilter}`
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data?.rows)) {
      setMessage(data?.error ?? "Could not load handoffs.");
      return;
    }
    setRows(data.rows);
    setCounts(data.counts ?? {});
    if (selectedId && !data.rows.some((h: Row) => h.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
    }
  }

  async function loadDetail(id: string) {
    setMessage(null);
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/admin/handoffs/${id}?propertyId=${encodeURIComponent(propertyId)}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        setMessage(data?.error ?? "Could not load this handoff.");
        return;
      }
      setSelectedId(id);
      setDetail(data);
      setAssignee(data.assignee ?? "");
      setEditingAssignee(false);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    setDetail(null);
    loadList(filter)
      .catch(() => setMessage("Could not load handoffs."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function refreshDetail(id: string) {
    const res = await fetch(
      `/api/admin/handoffs/${id}?propertyId=${encodeURIComponent(propertyId)}`
    );
    const data = await res.json().catch(() => null);
    if (res.ok && data?.id) {
      setDetail(data);
      setAssignee(data.assignee ?? "");
    }
    await loadList(filter);
  }

  async function addNote() {
    if (!detail || !author.trim() || !noteBody.trim()) {
      setMessage("Your name and the note text are both required.");
      return;
    }
    setMessage(null);
    const res = await fetch(`/api/admin/handoffs/${detail.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, author: author.trim(), body: noteBody.trim() }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error ?? "Could not save the note.");
      return;
    }
    setNoteBody("");
    await refreshDetail(detail.id);
  }

  async function saveAssignment() {
    if (!detail) return;
    setMessage(null);
    const res = await fetch(`/api/admin/handoffs/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        assignee: assignee.trim() ? assignee.trim() : null,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error ?? "Could not save the assignee.");
      return;
    }
    setEditingAssignee(false);
    await refreshDetail(detail.id);
  }

  async function setStatus(status: string) {
    if (!detail) return;
    setMessage(null);
    const res = await fetch(`/api/admin/handoffs/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, status }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error ?? "Could not update the status.");
      return;
    }
    // A status move usually leaves the current filter: follow the record.
    setFilter(status);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Filter handoffs by status" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const n = counts[f.value] ?? 0;
          return (
            <button
              key={f.value}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.value)}
              className={`min-h-[44px] rounded-full px-4 py-1 text-sm font-medium ${
                active ? "bg-black text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f.label} ({n})
            </button>
          );
        })}
      </div>

      {message && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}
      {loading && <p className="text-sm text-gray-500">Loading handoffs…</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          {!loading && rows.length === 0 && (
            <p className="text-sm text-gray-500">
              {filter === "OPEN"
                ? "Nothing needs attention. New handoffs land here the moment the bot escalates."
                : filter === "IN_PROGRESS"
                  ? "Nothing in progress."
                  : "Nothing resolved yet."}
            </p>
          )}
          {rows.map((h) => (
            <button
              key={h.id}
              onClick={() => void loadDetail(h.id)}
              aria-current={selectedId === h.id}
              className={`rounded-xl border px-4 py-3 text-left ${
                selectedId === h.id
                  ? "border-black bg-white shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-400"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${dotClass(h.status)}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                  {h.reason}
                </span>
                {h.language === "bn" && (
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    বাংলা
                  </span>
                )}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-sm text-gray-600">{h.summary}</span>
              {h.draft && (h.draft.guestFirstName || h.draft.room) && (
                <span className="mt-0.5 block truncate text-xs font-medium text-gray-700">
                  {h.draft.guestFirstName ?? "Guest"}
                  {h.draft.room ? ` · ${h.draft.room}` : ""}
                  {h.draft.checkIn && h.draft.checkOut ? ` · ${h.draft.checkIn} → ${h.draft.checkOut}` : ""}
                </span>
              )}
              <span className="mt-1 block text-xs text-gray-500">
                {h.assignee ? `With ${h.assignee}` : "Unassigned"} · {ageOf(h.createdAt)} ·{" "}
                {h.noteCount} {h.noteCount === 1 ? "note" : "notes"}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {detailLoading && <p className="text-sm text-gray-500">Loading conversation…</p>}
          {!detailLoading && !detail && rows.length > 0 && (
            <p className="hidden text-sm text-gray-500 lg:block">
              Select a handoff to read the full conversation.
            </p>
          )}
          {!detailLoading && detail && (
            <section
              aria-label={`Handoff: ${detail.reason}`}
              className="flex flex-col gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1 text-sm lg:hidden"
                >
                  ← List
                </button>
                <p className="min-w-0 flex-1 text-sm font-bold text-gray-900">{detail.reason}</p>
              </div>
              <p className="text-sm text-gray-700">{detail.summary}</p>
              <p className="flex items-center gap-2 text-xs text-gray-500">
                <span aria-hidden className={`h-2 w-2 rounded-full ${dotClass(detail.status)}`} />
                {statusLabel(detail.status)} · {ageOf(detail.createdAt)}
              </p>

              <div className="flex flex-wrap gap-2">
                {detail.status === "OPEN" && (
                  <button
                    type="button"
                    onClick={() => void setStatus("IN_PROGRESS")}
                    className="min-h-[44px] rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white"
                  >
                    Start progress
                  </button>
                )}
                {detail.status !== "CLOSED" && (
                  <button
                    type="button"
                    onClick={() => void setStatus("CLOSED")}
                    className="min-h-[44px] rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium hover:bg-gray-100"
                  >
                    Resolve
                  </button>
                )}
                {detail.status === "CLOSED" && (
                  <button
                    type="button"
                    onClick={() => void setStatus("OPEN")}
                    className="min-h-[44px] rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium hover:bg-gray-100"
                  >
                    Reopen
                  </button>
                )}
              </div>

              <div className="border-t border-gray-200 pt-2">
                {editingAssignee ? (
                  <div className="flex gap-2">
                    <input
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void saveAssignment()}
                      placeholder="Staff name (empty clears)"
                      aria-label="Assignee name"
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-black"
                    />
                    <button
                      type="button"
                      onClick={() => void saveAssignment()}
                      className="shrink-0 rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssignee(detail.assignee ?? "");
                        setEditingAssignee(false);
                      }}
                      className="shrink-0 rounded-lg border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700">
                    {detail.assignee ? (
                      <>
                        With <span className="font-medium">{detail.assignee}</span>{" "}
                      </>
                    ) : (
                      "Unassigned "
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingAssignee(true)}
                      className="underline"
                    >
                      {detail.assignee ? "Change" : "Assign"}
                    </button>
                  </p>
                )}
              </div>

              <div className="flex max-h-96 flex-col gap-2 overflow-y-auto border-t border-gray-200 pt-2">
                {detail.transcript.length === 0 && (
                  <p className="text-sm text-gray-500">No messages in this conversation.</p>
                )}
                {detail.transcript.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "self-end bg-black text-white"
                        : "self-start bg-gray-100 text-gray-900"
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
                    <span className="font-medium">{n.author}</span>{" "}
                    <span className="text-xs text-gray-500">{ageOf(n.createdAt)}</span>
                    <br />
                    {n.body}
                  </p>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t border-gray-200 pt-2">
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name"
                  aria-label="Note author"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-black"
                />
                <div className="flex gap-2">
                  <input
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void addNote()}
                    placeholder="Add a follow-up note…"
                    aria-label="Note text"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    onClick={() => void addNote()}
                    className="shrink-0 rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white"
                  >
                    Add note
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
