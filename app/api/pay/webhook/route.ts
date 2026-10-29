// Stripe webhook (booking payments).
//   POST /api/pay/webhook (raw body, Stripe-Signature verified)
// checkout.session.completed flips the link row to paid and sends the
// receipt email. Idempotent: replays find the row already paid and send
// nothing twice. Unknown events and unknown sessions get a 200 (never
// throw Stripe into a retry storm over something we can't use). Only
// signature failures get a 400.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatTaka } from "@/demo-config/rates";
import { sendPaymentConfirmationEmail } from "@/lib/email";
import {
  markPaidByStripeSession,
  paymentsEnabledGlobal,
  verifyStripeSignature,
} from "@/lib/payments";

export async function POST(req: NextRequest) {
  if (!paymentsEnabledGlobal()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const raw = await req.text().catch(() => "");
  const signature = req.headers.get("stripe-signature") ?? "";
  if (!verifyStripeSignature(raw, signature, secret)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }
  const event = JSON.parse(raw) as { type?: string; data?: { object?: { id?: string } } };
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }
  const sessionId = event.data?.object?.id ?? "";
  if (!sessionId) {
    return NextResponse.json({ received: true });
  }
  const before = await prisma.paymentLink
    .findUnique({ where: { stripeSessionId: sessionId } })
    .catch(() => null);
  if (!before) {
    // Not our session (or paid before the row existed — impossible by
    // construction, but 200 either way so Stripe stops retrying).
    return NextResponse.json({ received: true });
  }
  if (before.status === "paid") {
    return NextResponse.json({ received: true });
  }
  const paid = await markPaidByStripeSession(sessionId).catch(() => null);
  if (paid?.status === "paid" && paid.guestEmail) {
    try {
      await sendPaymentConfirmationEmail({
        to: paid.guestEmail,
        firstName: paid.guestFirstName ?? "Guest",
        bookingCode: paid.bookingCode,
        room: paid.room ?? "room",
        checkIn: paid.checkIn ?? "",
        checkOut: paid.checkOut ?? "",
        total: formatTaka(paid.amountPoisha),
      });
    } catch (e) {
      // The paid row is the truth; the email is a courtesy. Log and 200 —
      // retrying a paid webhook must never double-send or double-mark.
      console.error("Payment receipt email failed:", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ received: true });
}
