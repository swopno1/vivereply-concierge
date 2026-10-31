// AuditTrail: super-admin-only recent-activity list (Settings). Newest
// first, 100 rows max, optional per-property scope. Renders whatever the
// API returns — names/ids/outcomes only; secrets never reach this table
// because writers never store them.
"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  actorEmail: string | null;
  action: string;
  propertyId: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

const LABELS: Record<string, string> = {
  "login.success": "signed in",
  "login.fail": "failed sign-in",
  "signup.success": "signed up a resort",
  "domain.add": "added domain",
  "domain.activate": "activated domain",
  "domain.deactivate": "deactivated domain",
  "bridge.mint": "minted bridge key",
  "bridge.revoke": "revoked bridge key",
  "bridge.reactivate": "reactivated bridge key",
  "binding.save": "saved booking connection",
  "binding.edit": "edited booking connection",
  "binding.remove": "removed booking connection",
  "user.activate": "activated login",
  "user.deactivate": "deactivated login",
  "property.suspend": "suspended property",
  "property.resume": "resumed property",
  "payment.confirm": "confirmed a manual payment",
};

function detailText(detail: Row["detail"]): string | null {
  if (!detail || typeof detail !== "object") return null;
  const bits: string[] = [];
  for (const [k, v] of Object.entries(detail)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      bits.push(`${k}: ${v}`);
    }
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

export default function AuditTrail({ properties }: { properties: { id: string; name: string }[] }) {
  const [scope, setScope] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    const url = scope ? `/api/admin/audit?propertyId=${encodeURIComponent(scope)}` : "/api/admin/audit";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the activity log.");
        return r.json() as Promise<Row[]>;
      })
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : "Could not load the activity log.");
      });
    return () => {
      live = false;
    };
  }, [scope]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        Property
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-full border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id})
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {rows === null && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="text-sm text-gray-500">No activity yet.</p>
      )}
      {rows !== null && rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm"
            >
              <p className="text-gray-900">
                <span className="font-semibold">{LABELS[r.action] ?? r.action}</span>
                {" by "}
                <span className="font-mono text-xs">{r.actorEmail ?? "unknown"}</span>
              </p>
              <p className="text-xs text-gray-500">
                {new Date(r.createdAt).toLocaleString()}
                {r.propertyId ? ` · ${r.propertyId}` : ""}
                {r.ip ? ` · ${r.ip}` : ""}
                {detailText(r.detail) ? ` · ${detailText(r.detail)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
