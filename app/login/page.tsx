// Admin login (step 4.5). Single admin, password only — no signup,
// no email, no user table. The password is ADMIN_PASSWORD (env).
// After login the browser is sent to /admin (or ?next=, when that
// path is a same-site path) so the session cookie applies on load.

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/admin";
  return raw;
}

function LoginInner() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
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
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error("Invalid password.");
      window.location.href = next;
    } catch {
      setError("Invalid password.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-4">
      <h1 className="text-xl font-bold">Admin login</h1>
      <p className="mt-1 text-sm text-gray-500">
        Staff view and domain settings are protected. No signup in v1 — the admin password is set
        in the deployment environment.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Admin password"
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
