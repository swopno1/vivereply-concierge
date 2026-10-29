// Login (multi-tenant core). Owners sign in with email + password; the
// founder bootstrap is ADMIN_EMAIL + ADMIN_PASSWORD (env). After login
// the browser is sent to ?next= (same-site path only) or the role home
// (/admin for super-admin, /settings for owners) so the session cookie
// applies on load. Adaptive human check: after repeated failures the API
// answers 403 needCaptcha and the widget below appears; the token goes
// back with the retry (single-use: remount after each attempt).

"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import TurnstileWidget from "../../components/TurnstileWidget";

function safeNext(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

function LoginInner() {
  const params = useSearchParams();
  const requestedNext = params.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);

  async function submit() {
    if (!email.trim() || !password || sending) return;
    if (needCaptcha && !token) {
      setError("Please complete the human check.");
      return;
    }
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, turnstileToken: token || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 429) throw new Error("Too many attempts. Try again later.");
      if (res.status === 403 && data?.needCaptcha) {
        setNeedCaptcha(true);
        throw new Error("Please complete the human check and try again.");
      }
      if (!res.ok) throw new Error("Invalid email or password.");
      const fallback = data?.role === "OWNER" ? "/settings" : "/admin";
      window.location.href = safeNext(requestedNext, fallback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid email or password.");
    } finally {
      setSending(false);
      setToken("");
      setAttempt((a) => a + 1);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0C1222]">
          <img src="/brand/vivereply-mark.svg" alt="Vivereply logo" className="h-9 w-9" />
        </span>
        <span className="text-lg font-bold">Vivereply Concierge</span>
      </div>
      <h1 className="text-xl font-bold">Log in</h1>
      <p className="mt-1 text-sm text-gray-500">
        Owners sign in with their email and password. New here?{" "}
        <Link href="/signup" className="font-medium text-gray-900 underline">
          Register your resort
        </Link>
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Owner email"
          autoComplete="username"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password"
          autoComplete="current-password"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
        />
        {needCaptcha && <TurnstileWidget key={attempt} onVerify={setToken} />}
        <button
          onClick={submit}
          disabled={sending || !email.trim() || !password}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          Log in
        </button>
      </div>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <p className="mt-6 text-center text-xs text-gray-500">
        Vivereply Concierge · ViveScript Solutions LLC
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
