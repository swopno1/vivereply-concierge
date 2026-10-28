// Owner password change UI (auth Tier 1). Client component used by the
// protected /settings Profile room. Owners only — the bootstrap super-admin
// never sees it (that password lives in the deployment environment).
// Success signs every device out (the API revokes all sessions), so the
// widget sends the owner back to /login. A temporary (admin-issued)
// password shows a banner until it is replaced.

"use client";

import { useState } from "react";

export default function PasswordChange({ mustChange }: { mustChange: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function save() {
    if (sending) return;
    setMessage("");
    if (!current || !next) {
      setMessage("Current and new passwords are required.");
      return;
    }
    if (next.length < 12) {
      setMessage("The new password must be at least 12 characters.");
      return;
    }
    if (next !== confirm) {
      setMessage("The new passwords do not match.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not change the password.");
      window.location.href = "/login?next=/settings";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not change the password.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">Change password</p>
      {mustChange && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You are using a temporary password from registration — set your own now.
        </p>
      )}
      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      <input
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        placeholder="Current password"
        autoComplete="current-password"
        className="rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
      />
      <div className="flex gap-2">
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="New password (12+ chars)"
          autoComplete="new-password"
          className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Repeat new password"
          autoComplete="new-password"
          className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
        />
      </div>
      <button
        onClick={save}
        disabled={sending}
        className="self-start rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Change password
      </button>
      <p className="text-sm text-gray-500">Changing signs you out on every device.</p>
    </div>
  );
}
