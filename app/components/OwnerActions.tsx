// Owner login actions UI (auth Tier 1, super-admin only). Client component
// embedded in the /admin properties list: deactivate/reactivate a login,
// or sign it out on every device at once. Deactivating revokes sessions
// too; reactivating does not restore old sessions (they stay dead — the
// owner logs in fresh).

"use client";

import { useState } from "react";

export type OwnerLoginRow = { id: string; email: string; active: boolean };

export default function OwnerActions({ initial }: { initial: OwnerLoginRow[] }) {
  const [rows, setRows] = useState<OwnerLoginRow[]>(initial);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  async function toggle(row: OwnerLoginRow) {
    setMessage("");
    setSending(row.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not update the login.");
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, active: data.active === true } : r)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not update the login.");
    } finally {
      setSending(null);
    }
  }

  async function revoke(row: OwnerLoginRow) {
    setMessage("");
    setSending(row.id);
    try {
      const res = await fetch("/api/admin/users/revoke-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not revoke sessions.");
      setMessage(`Signed ${row.email} out on ${data.sessionsRevoked ?? 0} session(s).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not revoke sessions.");
    } finally {
      setSending(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {message && <p className="text-sm text-gray-600">{message}</p>}
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-sm ${row.active ? "text-gray-700" : "text-gray-400 line-through"}`}>
            {row.email}
          </p>
          <button
            onClick={() => revoke(row)}
            disabled={sending === row.id || !row.active}
            title="Sign out on every device"
            className="shrink-0 rounded-full border border-gray-300 px-3 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
          >
            Sign out all
          </button>
          <button
            onClick={() => toggle(row)}
            disabled={sending === row.id}
            className="shrink-0 rounded-full border border-gray-300 px-3 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
          >
            {row.active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      ))}
    </div>
  );
}
