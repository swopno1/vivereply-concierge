// Room-catalogue manager UI (adapter Phase 3). Client component used by
// the protected /settings server page. One property at a time: load its
// rows, edit inline, add, delete, or seed from the demo catalogue file
// (seed skips existing slugs, never overwrites). Prices are typed in taka
// and stored as integer poisha. Rows govern the chat catalogue for any
// property that has them — the file remains the demo fallback until it is
// seeded, so seeding is the moment to compare quotes before and after.

"use client";

import { useState } from "react";

export type RoomRow = {
  id: string;
  propertyId: string;
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
  highlights: string[];
};

const EMPTY = { slug: "", name: "", taka: "", suiteRoomId: "", highlights: "" };

export default function RoomCatalogues({ initialPropertyId }: { initialPropertyId?: string }) {
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [loadedFor, setLoadedFor] = useState("");
  const [rows, setRows] = useState<RoomRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  async function load(prop?: string) {
    const target = (prop ?? propertyId).trim();
    if (!target) return;
    setMessage("");
    setNotice("");
    const res = await fetch(`/api/admin/room-mappings?propertyId=${encodeURIComponent(target)}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) {
      setMessage(data?.error || "Could not load catalogue.");
      return;
    }
    setRows(data);
    setLoadedFor(target);
    setEditingId(null);
    setForm(EMPTY);
  }

  function toPoisha(taka: string): number | null {
    const n = Number(taka);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }

  function splitHighlights(raw: string): string[] {
    return raw
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
  }

  async function save() {
    const poisha = toPoisha(form.taka);
    if (!form.slug.trim() || !form.name.trim() || poisha === null || !form.suiteRoomId.trim() || sending) {
      setMessage("Slug, name, a positive taka price, and the backend room ID are required.");
      return;
    }
    setMessage("");
    setSending(true);
    try {
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        basePricePoisha: poisha,
        suiteRoomId: form.suiteRoomId.trim(),
        highlights: splitHighlights(form.highlights),
      };
      const res = editingId
        ? await fetch("/api/admin/room-mappings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch("/api/admin/room-mappings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId: loadedFor, ...payload }),
          });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not save room.");
      setForm(EMPTY);
      setEditingId(null);
      await load(loadedFor);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save room.");
    } finally {
      setSending(false);
    }
  }

  function startEdit(row: RoomRow) {
    setEditingId(row.id);
    setForm({
      slug: row.slug,
      name: row.name,
      taka: String(row.basePricePoisha / 100),
      suiteRoomId: row.suiteRoomId,
      highlights: row.highlights.join(", "),
    });
    setMessage("");
  }

  async function remove(row: RoomRow) {
    if (
      !window.confirm(
        `Remove ${row.slug} from ${loadedFor}? Chat stops offering it immediately. Undo: re-add the row below.`
      )
    )
      return;
    const res = await fetch("/api/admin/room-mappings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    });
    if (res.ok) await load(loadedFor);
  }

  async function seed() {
    if (!loadedFor || sending) return;
    setMessage("");
    setNotice("");
    setSending(true);
    try {
      const res = await fetch("/api/admin/room-mappings/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: loadedFor }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not seed catalogue.");
      setNotice(`Seeded ${data.created} rooms, skipped ${data.skipped} existing.`);
      await load(loadedFor);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not seed catalogue.");
    } finally {
      setSending(false);
    }
  }

  const inputClass =
    "rounded-full border px-4 py-2 text-sm outline-none focus:border-black disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="krishnachura-retreat"
          className={`flex-1 ${inputClass}`}
        />
        <button
          onClick={() => load()}
          disabled={!propertyId.trim()}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Load
        </button>
        {loadedFor && (
          <button
            onClick={seed}
            disabled={sending}
            title="Copy the demo catalogue file into this property (skips existing slugs)"
            className="rounded-full border px-5 py-2 text-sm disabled:opacity-40"
          >
            Seed from demo
          </button>
        )}
      </div>
      {message && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      )}
      {notice && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>
      )}

      {loadedFor && (
        <div className="flex flex-col gap-2">
          {rows.length === 0 && (
            <p className="text-sm text-gray-500">
              No rows for {loadedFor} — chat falls back to the demo file for the demo property,
              and fails honestly for any other property, until rows exist.
            </p>
          )}
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-300 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold">
                  {row.name} <span className="font-mono font-normal text-gray-500">{row.slug}</span>
                </p>
                <p className="text-sm text-gray-500">
                  ৳{(row.basePricePoisha / 100).toLocaleString("en-US")}/night · backend{" "}
                  <span className="font-mono">{row.suiteRoomId.slice(0, 8)}…</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => startEdit(row)} className="rounded-full border px-4 py-1 text-sm">
                  Edit
                </button>
                <button onClick={() => remove(row)} className="rounded-full border px-4 py-1 text-sm">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loadedFor && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-300 p-4">
          <p className="font-semibold">{editingId ? "Edit room" : "Add room"}</p>
          <div className="flex gap-2">
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="bamboo-cottage"
              className={`flex-1 ${inputClass}`}
            />
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Bamboo Cottage"
              className={`flex-1 ${inputClass}`}
            />
          </div>
          <div className="flex gap-2">
            <input
              value={form.taka}
              onChange={(e) => setForm({ ...form, taka: e.target.value })}
              placeholder="8500 (taka/night)"
              inputMode="decimal"
              className={`flex-1 ${inputClass}`}
            />
            <input
              value={form.suiteRoomId}
              onChange={(e) => setForm({ ...form, suiteRoomId: e.target.value })}
              placeholder="backend room ID"
              className={`flex-1 font-mono ${inputClass}`}
            />
          </div>
          <input
            value={form.highlights}
            onChange={(e) => setForm({ ...form, highlights: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Highlight one, highlight two (comma-separated)"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={sending}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {editingId ? "Save room" : "Add room"}
            </button>
            {editingId && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY);
                }}
                className="rounded-full border px-5 py-2 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
