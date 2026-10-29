// Approved-domain manager UI (step 4.5). Client component used by the
// protected /settings server page (single-property view). Add validates
// nothing on its own
// — the API enforces hostname format and duplicates. Deactivating a
// domain kills its widgets on the next chat message (the API re-checks
// approval every time), it does not just hide new embeds.

"use client";

import { useState } from "react";

export type ApprovedDomainRow = {
  id: string;
  domain: string;
  propertyId: string;
  active: boolean;
  createdAt: string;
};

export default function AdminDomains({
  initial,
  initialPropertyId,
}: {
  initial: ApprovedDomainRow[];
  initialPropertyId?: string;
}) {
  const [rows, setRows] = useState<ApprovedDomainRow[]>(initial);
  const [domain, setDomain] = useState("");
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/domains");
    if (res.ok) setRows(await res.json());
  }

  async function add() {
    if (!domain.trim() || sending) return;
    setMessage("");
    setSending(true);
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, propertyId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not add domain.");
      setDomain("");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not add domain.");
    } finally {
      setSending(false);
    }
  }

  async function toggle(row: ApprovedDomainRow) {
    if (
      row.active &&
      !window.confirm(
        `Deactivate ${row.domain}? Its widget stops on the next chat message. Undo: Reactivate below.`
      )
    )
      return;
    const res = await fetch("/api/admin/domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, active: !row.active }),
    });
    if (res.ok) await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-300 p-4">
        <p className="font-semibold">Add an approved domain</p>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="demo1.vivereply.com"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <input
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          placeholder="krishnachura-retreat"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <button
          onClick={add}
          disabled={sending || !domain.trim() || !propertyId.trim()}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Approve domain
        </button>
        {message && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="text-sm text-gray-500">
            No approved domains yet — no site can host the widget until you add one.
          </p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-300 px-4 py-3"
          >
            <div>
              <p className="font-mono text-sm font-semibold">{row.domain}</p>
              <p className="text-sm text-gray-500">
                {row.propertyId} · {row.active ? "Active" : "Inactive"}
              </p>
            </div>
            <button
              onClick={() => toggle(row)}
              className="rounded-full border px-4 py-1 text-sm"
            >
              {row.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
