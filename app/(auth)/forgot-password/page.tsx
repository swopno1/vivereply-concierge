// Forgot-password form (public reset, Phase 0). Posts the owner email
// to /api/auth/forgot-password, which answers { ok: true } whether or
// not the address exists — so this page shows the same "check your
// inbox" notice on every success and never reveals which emails have
// accounts. Styling mirrors the login form exactly.

"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!email.trim() || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.status === 429) throw new Error("Too many attempts. Try again later.");
      if (!res.ok) throw new Error("Enter a valid email address.");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setSending(false);
    }
  }

  // Mark header, Back-to-homepage, Docs, and footer live in the
  // (auth) layout — this page owns the form plus its cross-link.
  return (
    <>
      <h1 className="text-xl font-bold">Forgot password</h1>
      <p className="mt-1 text-sm text-gray-500">
        Enter your owner email and we&apos;ll send a reset link. Remembered it?{" "}
        <Link href="/login" className="font-medium text-gray-900 underline">
          Log in
        </Link>
      </p>
      {sent ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          If an account exists for that email, a reset link is on its way.
          It expires in 1 hour and works once.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Owner email"
            autoComplete="email"
            aria-label="Email"
            className="w-full rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
          />
          <button
            onClick={submit}
            disabled={sending || !email.trim()}
            className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            {sending ? "Sending…" : "Send reset link"}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </>
  );
}
