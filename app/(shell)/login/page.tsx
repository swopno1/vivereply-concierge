// Login (multi-tenant core). Owners sign in with the email + password from
// the seed file; the founder bootstrap is password-only (empty email,
// ADMIN_PASSWORD env). No signup anywhere. After login the browser is sent
// to ?next= (same-site path only) or the role home (/admin for super-admin,
// /settings for owners) so the session cookie applies on load.

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

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

  async function submit() {
    if (!password || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("Invalid email or password.");
      const fallback = data?.role === "OWNER" ? "/settings" : "/admin";
      window.location.href = safeNext(requestedNext, fallback);
    } catch {
      setError("Invalid email or password.");
    } finally {
      setSending(false);
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
        Owners sign in with the email and password from registration. No signup — new properties
        are registered by the Vivereply team.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Owner email"
          autoComplete="username"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password"
          autoComplete="current-password"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <button
          onClick={submit}
          disabled={sending || !password}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Log in
        </button>
      </div>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <p className="mt-6 text-center text-xs text-gray-400">
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
