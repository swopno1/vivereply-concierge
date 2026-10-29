// Property suspend/resume button (SUPER_ADMIN only, used by /admin).
// Client component: one click flips the kill-switch — INACTIVE stops the
// tenant's widget issuance, chat, bridge keys, and owner sessions on next
// use. Suspension confirms first (destructive-action rule); resuming is
// one click back. The pill beside this button shows current truth.

"use client";

import { useState } from "react";

export default function PropertyStatusToggle({
  propertyId,
  initialStatus,
}: {
  propertyId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function flip() {
    const next = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (
      next === "INACTIVE" &&
      !window.confirm(
        `Suspend ${propertyId}? Its widget, chat, bridge keys, and owner sessions stop immediately. Undo: Resume below.`
      )
    )
      return;
    setMessage("");
    setSending(true);
    try {
      const res = await fetch("/api/admin/properties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: propertyId, status: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not update the property.");
      setStatus(data.status);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not update the property.");
    } finally {
      setSending(false);
    }
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
        }`}
      >
        {status}
      </span>
      <button
        onClick={flip}
        disabled={sending}
        className="shrink-0 rounded-full border border-gray-300 px-3 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
      >
        {status === "ACTIVE" ? "Suspend" : "Resume"}
      </button>
      {message && <span className="text-xs text-red-700">{message}</span>}
    </span>
  );
}
