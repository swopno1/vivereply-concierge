"use client";

// Stripe continuance button: posts the token (nothing else — the amount
// lives server-side on the link row) and follows the Checkout URL the
// server returns. Double-clicks are harmless: the server's idempotency
// key collapses retries to one Stripe session.
import { useState } from "react";

export default function PayButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/pay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.url) {
        setError(j?.error ?? "The card payment could not be started. Please try again.");
        setBusy(false);
        return;
      }
      window.location.href = j.url as string;
    } catch {
      setError("The card payment could not be started. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-black px-6 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Opening secure payment…" : "Continue to secure card payment"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
