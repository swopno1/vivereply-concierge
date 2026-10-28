// Bridge-token manager UI. Client component used by the protected
// /admin server page. Minting shows the full token ONCE — it is never
// stored or shown again, so the admin must copy it into the client
// server's secrets immediately. Revoking kills the key on its next API
// call, because every bridge request re-checks the token row.

"use client";

import { useState } from "react";

export type BridgeTokenRow = {
  id: string;
  prefix: string;
  name: string;
  propertyId: string;
  active: boolean;
  createdAt: string;
};

export default function BridgeTokens({ initial }: { initial: BridgeTokenRow[] }) {
  const [rows, setRows] = useState<BridgeTokenRow[]>(initial);
  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState("krishnachura-retreat");
  const [message, setMessage] = useState("");
  const [onceToken, setOnceToken] = useState("");
  const [sending, setSending] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/bridge-tokens");
    if (res.ok) setRows(await res.json());
  }

  async function mint() {
    if (!name.trim() || !propertyId.trim() || sending) return;
    setMessage("");
    setOnceToken("");
    setSending(true);
    try {
      const res = await fetch("/api/admin/bridge-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, propertyId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not mint token.");
      if (typeof data?.token === "string") setOnceToken(data.token);
      setName("");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not mint token.");
    } finally {
      setSending(false);
    }
  }

  async function toggle(row: BridgeTokenRow) {
    const res = await fetch("/api/admin/bridge-tokens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, active: !row.active }),
    });
    if (res.ok) await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-300 p-4">
        <p className="font-semibold">Mint a bridge token</p>
        <p className="text-sm text-gray-500">
          One per client dashboard integration. The token works only from that dashboard&apos;s
          server, and only for this property&apos;s handoffs.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && mint()}
          placeholder="demo1 dashboard"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <input
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          placeholder="krishnachura-retreat"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <button
          onClick={mint}
          disabled={sending || !name.trim() || !propertyId.trim()}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Mint token
        </button>
        {onceToken && (
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium text-amber-800">
              Copy this now — it is never shown again:
            </p>
            <p className="mt-1 break-all font-mono text-sm text-gray-900">{onceToken}</p>
          </div>
        )}
        {message && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="text-sm text-gray-500">
            No bridge tokens yet — no client server can read handoffs until you mint one.
          </p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-300 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold">{row.name}</p>
              <p className="font-mono text-sm text-gray-500">cb.{row.prefix}.…</p>
              <p className="text-sm text-gray-500">
                {row.propertyId} · {row.active ? "Active" : "Revoked"}
              </p>
            </div>
            <button
              onClick={() => toggle(row)}
              className="rounded-full border px-4 py-1 text-sm"
            >
              {row.active ? "Revoke" : "Reactivate"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
