// Reset-password form (public reset, Phase 0; landed from the emailed
// link). The ?token= is the auth — it is verified server-side by POST
// /api/auth/reset-password and never rendered. New + confirm fields
// mirror the settings PasswordChange widget; success signs every
// device out, so the owner logs in again with the new password.

"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function ResetInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (sending) return;
    setError("");
    if (password.length < 12) {
      setError("The new password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "This reset link is invalid or expired.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "This reset link is invalid or expired.");
    } finally {
      setSending(false);
    }
  }

  // Mark header, Back-to-homepage, Docs, and footer live in the
  // (auth) layout — this page owns the form plus its cross-links.
  return (
    <>
      <h1 className="text-xl font-bold">Set a new password</h1>
      <p className="mt-1 text-sm text-gray-500">
        Choose a new password for your owner account. Changed your mind?{" "}
        <Link href="/login" className="font-medium text-gray-900 underline">
          Log in
        </Link>
      </p>
      {!token ? (
        <>
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            This reset link is invalid or expired.
          </p>
          <p className="mt-3 text-center text-sm text-gray-500">
            <Link href="/forgot-password" className="font-medium text-gray-900 underline">
              Request a new link
            </Link>
          </p>
        </>
      ) : done ? (
        <>
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your password is reset. Every device was signed out — log in
            with your new password.
          </p>
          <Link
            href="/login"
            className="mt-4 rounded-full bg-black px-5 py-2 text-center text-sm font-medium text-white"
          >
            Log in
          </Link>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="New password (min 12 characters)"
              autoComplete="new-password"
              aria-label="New password"
              className="w-full rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Confirm new password"
              autoComplete="new-password"
              aria-label="Confirm new password"
              className="w-full rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
            />
            <button
              onClick={submit}
              disabled={sending}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            >
              {sending ? "Resetting…" : "Reset password"}
            </button>
          </div>
          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <p className="mt-3 text-center text-sm text-gray-500">
            Link expired?{" "}
            <Link href="/forgot-password" className="font-medium text-gray-900 underline">
              Request a new link
            </Link>
          </p>
        </>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
