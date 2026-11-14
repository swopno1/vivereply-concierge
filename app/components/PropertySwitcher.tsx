// Property switcher (D1): pinned at the top of the sidebar. Posts to
// /api/admin/switch-property (ownership re-verified server-side) and
// reloads so every per-property page re-scopes through the tenant
// context. A single property renders as a static chip, not a menu.

"use client";

import { useState } from "react";
import type { OwnerProperty } from "@/lib/dashboard";

export default function PropertySwitcher({
  properties,
  currentId,
}: {
  properties: OwnerProperty[];
  currentId: string | null;
}) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = properties.find((p) => p.id === currentId) ?? properties[0] ?? null;

  async function onSelect(id: string) {
    if (!id || id === currentId || switching) return;
    setSwitching(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/switch-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: id }),
      });
      if (!r.ok) {
        setError("Could not switch property.");
        setSwitching(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not switch property.");
      setSwitching(false);
    }
  }

  if (!current) return null;

  return (
    <div className="flex flex-col gap-1 px-2 py-2" aria-label="Property">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0C1222]">
          <img src="/brand/vivereply-mark.svg" alt="" className="h-7 w-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight">{current.name}</span>
          <span className="block truncate text-xs text-gray-500">{current.planBadge}</span>
        </span>
      </div>
      {properties.length > 1 && (
        <select
          aria-label="Switch property"
          value={current.id}
          disabled={switching}
          onChange={(e) => void onSelect(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-60"
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.planBadge}
            </option>
          ))}
        </select>
      )}
      {switching && <p className="text-xs text-gray-500">Switching…</p>}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
