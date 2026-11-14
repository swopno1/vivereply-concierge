// Billing client (Phase 3, OWNER only). Plan + usage + subscribe /
// change / cancel. This file must NEVER render a dollar figure
// until the founder says publish — plan names, conversation limits,
// days, and counts only (grep for "$" before every commit touching
// it). The tier picker lists limits alone: feature-level gates are
// deferred, so every tier runs the same features today and the
// picker claims nothing else. NO OVERAGE UI until metered billing
// ships (founder decision): no toggle, no promises of overage or
// separate invoicing anywhere in this file.

"use client";

import { useState } from "react";

type Snapshot = {
  hasSubscription: boolean;
  status: string;
  tier: string;
  interval: string;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  overageAgreed: boolean;
  usageThisMonth: number;
  quotaThisMonth: number;
  gate: { allowed: boolean; reason: string };
};

const TIERS = [
  { id: "STARTER", name: "Starter", quota: 500 },
  { id: "GROWTH", name: "Growth", quota: 2000, recommended: true },
  { id: "SCALE", name: "Scale", quota: 7500 },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function BillingClient({
  snapshot,
  checkout,
}: {
  snapshot: Snapshot;
  checkout: "success" | "cancelled" | null;
}) {
  const [tier, setTier] = useState(snapshot.tier);
  const [interval, setInterval] = useState(snapshot.interval);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const hasActiveSub =
    snapshot.hasSubscription &&
    (snapshot.status === "ACTIVE" || snapshot.status === "PAST_DUE");
  const paused = !snapshot.gate.allowed;
  const usagePct = Math.min(100, Math.round((snapshot.usageThisMonth / snapshot.quotaThisMonth) * 100));
  const overQuota = Math.max(0, snapshot.usageThisMonth - snapshot.quotaThisMonth);
  const pickedQuota = TIERS.find((t) => t.id === tier)?.quota ?? 0;
  const downgradeBelowUsage = hasActiveSub && pickedQuota < snapshot.usageThisMonth;

  async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string; url?: string }> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error || "Something went wrong." };
    return { ok: true, url: data?.url };
  }

  async function subscribe() {
    if (sending) return;
    setMessage("");
    setSending(true);
    try {
      const r = await post("/api/billing/checkout", { tier, interval });
      if (!r.ok || !r.url) throw new Error(r.error || "Checkout is unavailable.");
      window.location.href = r.url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Checkout is unavailable.");
      setSending(false);
    }
  }

  async function changePlan() {
    if (sending) return;
    setMessage("");
    setSending(true);
    try {
      const r = await post("/api/billing/change-plan", { tier, interval });
      if (!r.ok) throw new Error(r.error || "Could not change the plan.");
      window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not change the plan.");
      setSending(false);
    }
  }

  async function cancel() {
    if (sending) return;
    setMessage("");
    setSending(true);
    try {
      const r = await post("/api/billing/cancel", {});
      if (!r.ok) throw new Error(r.error || "Could not cancel.");
      window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not cancel.");
      setSending(false);
    }
  }

  function statusLine(): string {
    if (!snapshot.hasSubscription) return "No billing record — full access.";
    switch (snapshot.status) {
      case "TRIAL":
        return `Free trial — ${snapshot.trialDaysLeft} day${snapshot.trialDaysLeft === 1 ? "" : "s"} left (ends ${fmtDate(snapshot.trialEndsAt)}). Full Growth features, no card needed yet.`;
      case "ACTIVE":
        return snapshot.cancelAtPeriodEnd
          ? `Cancelling — access continues to ${fmtDate(snapshot.currentPeriodEnd)}, then guest chat pauses unless you resubscribe.`
          : `${snapshot.interval === "ANNUAL" ? "Annual" : "Monthly"} plan — next invoice ${fmtDate(snapshot.currentPeriodEnd)}.`;
      case "PAST_DUE":
        return "Latest payment failed — guest chat keeps running while payment is retried. Reply to our email so we can sort it out.";
      case "CANCELED":
        return `Subscription ended ${fmtDate(snapshot.currentPeriodEnd)}.`;
      case "EXPIRED":
        return "Guest chat is paused. Nothing is deleted — subscribe below and the assistant resumes immediately.";
      default:
        return "Billing state unclear — contact us.";
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4 md:p-6">
      <h1 className="text-xl font-bold text-gray-900">Orders &amp; Billing</h1>
      {checkout === "success" && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Checkout complete — your plan activates in a moment. If this page hasn&apos;t updated,
          wait a few seconds and refresh.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          Checkout cancelled — nothing changed.
        </p>
      )}
      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">
          {snapshot.hasSubscription && snapshot.status !== "TRIAL"
            ? `${TIERS.find((t) => t.id === snapshot.tier)?.name ?? snapshot.tier} plan`
            : "Current plan"}
        </p>
        <p className="text-sm text-gray-600">{statusLine()}</p>
        {paused && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {snapshot.gate.reason === "quota-exceeded"
              ? "Guest chat is paused — the monthly limit is reached. It resumes automatically next month, or on upgrade."
              : "Guest chat is paused — subscribe below to resume immediately."}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Usage this month</p>
        <p className="text-sm text-gray-600">
          {snapshot.usageThisMonth.toLocaleString()} of {snapshot.quotaThisMonth.toLocaleString()} conversations
          {overQuota > 0 && ` (${overQuota.toLocaleString()} over the plan)`}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${usagePct}% of monthly conversations used`}>
          <div
            className={`h-full rounded-full ${usagePct >= 100 ? "bg-red-500" : usagePct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">
          One conversation = one guest chat thread. Past 120% of the plan, guest chat pauses until
          next month.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">{hasActiveSub ? "Change plan" : "Choose a plan"}</p>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTier(t.id)}
              aria-pressed={tier === t.id}
              className={`rounded-xl border px-3 py-2 text-left ${tier === t.id ? "border-black bg-gray-50" : "border-gray-200"}`}
            >
              <span className="block text-sm font-semibold text-gray-900">
                {t.name}
                {t.recommended && <span className="ml-1 text-xs font-normal text-gray-500">(popular)</span>}
              </span>
              <span className="block text-xs text-gray-500">{t.quota.toLocaleString()} conversations/mo</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2" role="group" aria-label="Billing interval">
          {(["MONTHLY", "ANNUAL"] as const).map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              aria-pressed={interval === iv}
              className={`rounded-full border px-4 py-1.5 text-sm ${interval === iv ? "border-black bg-gray-900 text-white" : "border-gray-200 text-gray-700"}`}
            >
              {iv === "MONTHLY" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
        {downgradeBelowUsage && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your usage ({snapshot.usageThisMonth.toLocaleString()}) already exceeds this plan
            ({pickedQuota.toLocaleString()}) — guest chat pauses at 120% until next month.
          </p>
        )}
        <div>
          {hasActiveSub ? (
            <button
              onClick={changePlan}
              disabled={sending}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {sending ? "Changing…" : "Change plan"}
            </button>
          ) : (
            <button
              onClick={subscribe}
              disabled={sending}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {sending ? "Starting checkout…" : "Subscribe"}
            </button>
          )}
        </div>
        {!hasActiveSub && (
          <p className="text-xs text-gray-500">
            Checkout is hosted by Stripe — card details never touch our servers.
          </p>
        )}
      </div>

      {hasActiveSub && !snapshot.cancelAtPeriodEnd && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Cancel subscription</p>
          <p className="text-sm text-gray-600">
            Access continues to {fmtDate(snapshot.currentPeriodEnd)} (already paid), then guest chat
            pauses. Nothing is deleted.
          </p>
          <div>
            {confirmCancel ? (
              <span className="flex gap-2">
                <button
                  onClick={cancel}
                  disabled={sending}
                  className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {sending ? "Cancelling…" : "Yes, cancel at period end"}
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700"
                >
                  Keep my plan
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700"
              >
                Cancel subscription
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
