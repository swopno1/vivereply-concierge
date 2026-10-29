"use client";

// "Booking payments" Settings room: the property's recent payment links
// with staff confirmation for manual transfers. Card links flip only via
// the Stripe webhook — there is deliberately no button for them.

import { useState } from "react";

export type PaymentRow = {
  id: string;
  bookingCode: string;
  method: string;
  status: string;
  amountPoisha: number;
  guestFirstName: string | null;
  room: string | null;
  checkIn: string | null;
  checkOut: string | null;
  manualReference: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
};

function taka(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString("en-US")}`;
}

export type StripeStatus = {
  mode: "test" | "live" | "unset" | "unrecognized";
  webhook: boolean;
};

const MODE_COPY: Record<StripeStatus["mode"], { label: string; tone: string }> = {
  test: { label: "Stripe: TEST mode — safe to click through, no real charges.", tone: "bg-blue-50 text-blue-800 border-blue-200" },
  live: { label: "Stripe: LIVE — card links take real money.", tone: "bg-red-50 text-red-800 border-red-200" },
  unset: { label: "Stripe: not configured — manual transfers only.", tone: "bg-gray-100 text-gray-700 border-gray-200" },
  unrecognized: { label: "Stripe: key prefix unrecognized — check STRIPE_SECRET_KEY.", tone: "bg-amber-50 text-amber-800 border-amber-200" },
};

export default function Payments({
  initial,
  initialPropertyId,
  stripe,
}: {
  initial: PaymentRow[];
  initialPropertyId: string;
  stripe: StripeStatus;
}) {
  const mode = MODE_COPY[stripe.mode];
  const [rows, setRows] = useState<PaymentRow[]>(initial);
  const [reference, setReference] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const r = await fetch(
      `/api/admin/payments?propertyId=${encodeURIComponent(initialPropertyId)}`
    );
    if (r.ok) setRows(await r.json());
  }

  async function confirm(id: string) {
    const ref = (reference[id] ?? "").trim();
    if (
      !confirm(
        `Confirm this manual payment as received${ref ? ` (ref: ${ref})` : ""}? The guest gets a receipt email. This cannot be undone here — double-check the transaction ID first.`
      )
    ) {
      return;
    }
    setBusy(id);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/payments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, propertyId: initialPropertyId, manualReference: ref }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? "Confirmed — receipt email sent." : (j.error ?? "Confirmation failed."));
    } catch {
      setMsg("Confirmation failed to reach the server.");
    } finally {
      setBusy(null);
    }
    void reload();
  }

  const empty = (
    <p className="text-sm text-gray-500">
      No payment links yet for <span className="font-mono">{initialPropertyId}</span>. Links the
      chatbot mints for held drafts appear here.
    </p>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className={`rounded-xl border px-4 py-2 text-sm ${mode.tone}`}>
        <p>{mode.label}</p>
        <p>
          Webhook secret: {stripe.webhook ? "configured." : "MISSING — card links can never flip to paid until it is set."}
        </p>
      </div>
      {rows.length === 0 && empty}
      {rows.length > 0 && <div className="flex flex-col gap-2">
      {rows.map((p) => (
        <div
          key={p.id}
          className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-900">{p.bookingCode}</span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              {p.method === "stripe" ? "card" : "manual"}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              {p.status}
            </span>
            <span className="text-sm font-bold text-gray-900">{taka(p.amountPoisha)}</span>
          </div>
          <p className="text-xs text-gray-500">
            {p.guestFirstName ?? "Guest"}
            {p.room ? ` · ${p.room}` : ""}
            {p.checkIn && p.checkOut ? ` · ${p.checkIn} → ${p.checkOut}` : ""}
            {p.paidAt
              ? ` · paid ${new Date(p.paidAt).toLocaleString()}`
              : ` · expires ${new Date(p.expiresAt).toLocaleString()}`}
            {p.manualReference ? ` · ref ${p.manualReference}` : ""}
          </p>
          {p.status === "pending" && p.method === "manual" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={reference[p.id] ?? ""}
                onChange={(e) => setReference({ ...reference, [p.id]: e.target.value })}
                placeholder="Transaction ID from the guest (optional)"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => void confirm(p.id)}
                disabled={busy === p.id}
                className="rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {busy === p.id ? "Confirming…" : "Confirm received"}
              </button>
            </div>
          )}
          {p.status === "pending" && p.method === "stripe" && (
            <p className="text-xs text-gray-500">
              Card link — flips to paid automatically when Stripe confirms. Nothing to do by hand.
            </p>
          )}
        </div>
      ))}
      {msg && (
        <p role="status" className="text-sm text-gray-700">
          {msg}
        </p>
      )}
      </div>}
    </div>
  );
}
