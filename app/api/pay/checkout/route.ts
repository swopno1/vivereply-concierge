// Stripe continuance API (booking payments).
//   POST /api/pay/checkout { token } -> { url }
// The browser sends ONLY the token: amount, booking, and guest all come
// from the server-side link row. Retries and double-clicks collapse to
// one Stripe session via the link-scoped idempotency key.

import { NextRequest, NextResponse } from "next/server";
import {
  createStripeCheckoutSession,
  getLinkByToken,
  paymentOrigin,
  paymentsEnabledGlobal,
  propertyTakesPayments,
} from "@/lib/payments";

export async function POST(req: NextRequest) {
  if (!paymentsEnabledGlobal()) {
    return NextResponse.json({ error: "Payments are not available." }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const link = await getLinkByToken(token).catch(() => null);
  if (!link || !propertyTakesPayments(link.propertyId)) {
    return NextResponse.json({ error: "This payment link isn't usable." }, { status: 404 });
  }
  if (link.status === "paid") {
    return NextResponse.json({ error: "This booking is already paid." }, { status: 409 });
  }
  if (link.status !== "pending") {
    return NextResponse.json(
      { error: "This payment link has expired. Ask the chatbot for a fresh one." },
      { status: 410 }
    );
  }
  if (link.method !== "stripe") {
    return NextResponse.json(
      { error: "This link is for manual transfer — follow the instructions on the page." },
      { status: 400 }
    );
  }
  try {
    const origin = paymentOrigin();
    const { url } = await createStripeCheckoutSession(link, origin);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The card payment could not be started." },
      { status: 502 }
    );
  }
}
