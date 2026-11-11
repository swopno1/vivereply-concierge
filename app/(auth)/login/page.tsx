// Login (multi-tenant core). Owners sign in with email + password; the
// founder bootstrap is ADMIN_EMAIL + ADMIN_PASSWORD (env). After login
// the browser is sent to ?next= (same-site path only) or /settings — the
// single configuration home for every role — so the session cookie
// applies on load. Adaptive human check: after repeated failures the API
// answers 403 needCaptcha and the widget below appears; the token goes
// back with the retry (single-use: remount after each attempt).
// 2FA second step: when the account enabled TOTP, step 1 answers
// { twoFactorRequired, challengeToken } instead of a session, and this
// page swaps to the code form. The challenge is a bearer credential —
// it lives in component state only, never in the URL.

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
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

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
      if (data?.twoFactorRequired && typeof data?.challengeToken === "string") {
        // Password passed; the session waits behind the second step.
        // Drop the password from memory — it has served its purpose.
        setPassword("");
        setChallenge(data.challengeToken);
        return;
      }
      const fallback = "/settings";
      window.location.href = safeNext(requestedNext, fallback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid email or password.");
    } finally {
      setSending(false);
      setToken("");
      setAttempt((a) => a + 1);
    }
  }

  async function verify() {
    if (!code.trim() || !challenge || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useRecovery
            ? { challengeToken: challenge, recoveryCode: code.trim() }
            : { challengeToken: challenge, code: code.trim() }
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Invalid code. Try again.");
      const fallback = "/settings";
      window.location.href = safeNext(requestedNext, fallback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code. Try again.");
    } finally {
      setSending(false);
    }
  }

  function backToPassword() {
    setChallenge("");
    setCode("");
    setUseRecovery(false);
    setError("");
  }

  // Mark header, Back-to-homepage, Docs, and footer live in the
  // (auth) layout — this page owns the form plus its cross-links.
  return (
    <>
      <h1 className="text-xl font-bold">{challenge ? "Check your app" : "Log in"}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {challenge ? (
          <>Password accepted. One more step to finish logging in.</>
        ) : (
          <>
            Owners sign in with their email and password. New here?{" "}
            <Link href="/signup" className="font-medium text-gray-900 underline">
              Register your resort
            </Link>
          </>
        )}
      </p>
      {challenge ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm text-gray-500">
            {useRecovery
              ? "Enter one of your recovery codes. Each code works once."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder={useRecovery ? "Recovery code (XXXX-XXXX)" : "6-digit code"}
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            aria-label={useRecovery ? "Recovery code" : "Authentication code"}
            className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black focus-visible:ring-2 focus-visible:ring-gray-900"
          />
          <button
            onClick={verify}
            disabled={sending || !code.trim()}
            className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            {sending ? "Verifying…" : "Verify"}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode("");
                setError("");
              }}
              className="font-medium text-gray-900 underline"
            >
              {useRecovery ? "Use my authenticator app instead" : "Lost your device? Use a recovery code"}
            </button>
            <button onClick={backToPassword} className="font-medium text-gray-500 underline">
              Back
            </button>
          </div>
        </div>
      ) : (
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
            {sending ? "Logging in…" : "Log in"}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <p className="mt-3 text-center text-sm text-gray-500">
        <Link href="/forgot-password" className="font-medium text-gray-900 underline">
          Forgot password?
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
