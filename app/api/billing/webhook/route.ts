// Stripe webhook (Phase 3): thin adapter over lib/stripe-webhook.
// Register exactly these events on the endpoint (test mode, then
// live — see .env.example §2):
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted,
//   invoice.payment_succeeded, invoice.payment_failed
// Order: signature verified → CLAIM FIRST → apply (see the engine
// for the idempotency contract). No card data ever arrives here —
// Stripe sends ids and statuses only.
// SERVICE PATH (marked): unattributed service writes (the caller is
// Stripe, authenticated by HMAC, not a session).
import { NextRequest, NextResponse } from "next/server";
import { processWebhookEvent } from "@/lib/stripe-webhook";
import { stripe, stripeWebhookSecret } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const signature = req.headers.get("stripe-signature") ?? "";
  let client;
  try {
    client = stripe();
  } catch {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
  }
  const outcome = await processWebhookEvent({
    raw,
    signature,
    verify: (body, sig) => client.webhooks.constructEvent(body, sig, stripeWebhookSecret()),
  });
  return NextResponse.json(outcome.body, { status: outcome.status });
}
