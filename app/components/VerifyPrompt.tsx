// Locked-config prompt (client): shown on Settings / onboarding while
// the owner's email is unverified. Explains the lock, offers resend
// (rate-limited server-side), and links back after verifying.

"use client";

import { useState } from "react";

export default function VerifyPrompt({ email }: { email: string | null }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function resend() {
    if (sending) return;
    setMessage("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/verify/resend", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.status === 429) {
        setMessage("Too many requests. Try again in an hour.");
      } else if (!res.ok) {
        setMessage(data?.error || "Could not resend. Try again in a moment.");
      } else if (data?.emailSent === false) {
        setMessage("Email is not available right now. Try again later.");
      } else {
        setMessage("Verification email sent — check your inbox (and spam).");
      }
    } catch {
      setMessage("Could not resend. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-4">
      <h1 className="text-xl font-bold">Verify your email</h1>
      <p className="mt-2 text-sm text-gray-600">
        We sent a verification link to{" "}
        <span className="font-medium text-gray-900">{email ?? "your inbox"}</span>.
        Click it to unlock your resort&apos;s configuration — rooms, backend,
        widget, and staff access. The link expires in 24 hours.
      </p>
      <button
        onClick={resend}
        disabled={sending}
        className="mt-4 rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Resend verification email
      </button>
      {message && <p className="mt-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">{message}</p>}
    </main>
  );
}
