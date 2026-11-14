// Property contact editor (D1 settings). Shows the property name
// (read-only) and edits the handoff contact number guests are offered
// (PropertyProfile.phone) via PATCH /api/admin/profile.

"use client";

import { useState } from "react";

export default function PropertyContact({
  propertyId,
  propertyName,
  initialPhone,
}: {
  propertyId: string;
  propertyName: string;
  initialPhone: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
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
        body: JSON.stringify({ propertyId, phone }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setPhone(data.phone ?? "");
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm text-gray-900">
        <span className="font-semibold">{propertyName}</span>
      </p>
      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Handoff contact number
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+8801XXXXXXXXX"
          maxLength={32}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={sending}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {sending ? "Saving…" : "Save"}
        </button>
        {message && (
          <p role="status" className="text-sm text-gray-600">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
