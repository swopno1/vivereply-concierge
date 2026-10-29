// Public signup (self-serve registration). Creates a Property (ACTIVE)
// + OWNER login (UNVERIFIED) + verification email, and logs the owner
// in — config surfaces stay locked until the email is proven (see
// VerifyPrompt). Turnstile is REQUIRED on every submit (single-use
// tokens: the widget remounts after each attempt). Password minimum
// matches the account rule (12).

"use client";

import Link from "next/link";
import { useState } from "react";
import TurnstileWidget from "../../components/TurnstileWidget";

export default function SignupPage() {
  const [resortName, setResortName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!resortName.trim() || !email.trim() || password.length < 12 || !token || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resortName: resortName.trim(), email: email.trim(), password, turnstileToken: token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Registration failed.");
      window.location.href = "/settings";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setSending(false);
      setToken("");
      setAttempt((a) => a + 1);
    }
  }

  const valid = resortName.trim() && email.trim() && password.length >= 12 && token && !sending;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0C1222]">
          <img src="/brand/vivereply-mark.svg" alt="Vivereply logo" className="h-9 w-9" />
        </span>
        <span className="text-lg font-bold">Vivereply Concierge</span>
      </div>
      <h1 className="text-xl font-bold">Register your resort</h1>
      <p className="mt-1 text-sm text-gray-500">
        One account per resort. You&apos;ll verify your email before
        configuring rooms, backend, and widget.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <input
          value={resortName}
          onChange={(e) => setResortName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Resort name"
          autoComplete="organization"
          aria-label="Resort name"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Work email"
          autoComplete="email"
          aria-label="Work email"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password (min 12 characters)"
          autoComplete="new-password"
          aria-label="Password"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
        />
        <TurnstileWidget key={attempt} onVerify={setToken} />
        <button
          onClick={submit}
          disabled={!valid}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          Create account
        </button>
      </div>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <p className="mt-4 text-center text-sm text-gray-500">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-gray-900 underline">
          Log in
        </Link>
      </p>
      <p className="mt-6 text-center text-xs text-gray-500">
        Vivereply Concierge · ViveScript Solutions LLC
      </p>
    </main>
  );
}
