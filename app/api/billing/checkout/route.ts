// Billing Checkout (Phase 3): starts a Stripe subscription for the
// owner's property. OWNER + verified email only. New subscriptions
// only — an active subscription must use change-plan instead (409).
// No card data touches this server: we create a Checkout Session and
// hand the browser Stripe's hosted URL. Prices live in Stripe (env
// Price ids); the app only ever names tiers + intervals. Test mode
// first (founder keys), then live — the code never knows which.
// SERVICE PATH (marked): subscription writes by verified session.
import { NextRequest, NextResponse } from "next/server";
import { prismaService } from "@/lib/prisma";
import { getSession, sessionOwnerVerified } from "@/lib/tenant";
import { clientIp, logAudit } from "@/lib/audit";
import { VALID_INTERVALS, VALID_TIERS, startTrial } from "@/lib/billing";
import { priceIdFor, stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "OWNER" || !session.propertyId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json(
      { error: "Verify your email to manage billing." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  const tier = typeof body?.tier === "string" ? body.tier : "";
  const interval = typeof body?.interval === "string" ? body.interval : "";
  if (
    !(VALID_TIERS as readonly string[]).includes(tier) ||
    !(VALID_INTERVALS as readonly string[]).includes(interval)
  ) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  const price = priceIdFor(tier, interval);
  if (!price) {
    return NextResponse.json(
      { error: "That plan isn't available right now." },
      { status: 400 }
    );
  }

  const db = prismaService();
  const propertyId = session.propertyId;
  let sub = await db.subscription.findUnique({ where: { propertyId } }).catch(() => null);
  if (!sub) {
    // Grandfathered row subscribing for the first time: give it the
    // trial row first (generous, harmless — trial + subscribe-early
    // coexist), then proceed to Checkout like everyone else.
    try {
      await startTrial(db, propertyId, new Date());
    } catch {
      return NextResponse.json({ error: "Billing is unavailable right now." }, { status: 500 });
    }
    sub = await db.subscription.findUnique({ where: { propertyId } }).catch(() => null);
    if (!sub) {
      return NextResponse.json({ error: "Billing is unavailable right now." }, { status: 500 });
    }
  }
  if (sub.stripeSubscriptionId && (sub.status === "ACTIVE" || sub.status === "PAST_DUE")) {
    return NextResponse.json(
      { error: "This property already has a subscription — change the plan instead." },
      { status: 409 }
    );
  }

  let client;
  try {
    client = stripe();
  } catch {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
  }
  try {
    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const customer = await client.customers.create({
        email: session.email ?? undefined,
        metadata: { propertyId },
      });
      customerId = customer.id;
      await db.subscription.update({
        where: { propertyId },
        data: { stripeCustomerId: customerId },
      });
    }
    const base = (process.env.APP_BASE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
    const checkout = await client.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/billing?checkout=success`,
      cancel_url: `${base}/billing?checkout=cancelled`,
      client_reference_id: propertyId,
      metadata: { propertyId, tier, interval },
      subscription_data: { metadata: { propertyId, tier, interval } },
    });
    if (!checkout.url) {
      return NextResponse.json({ error: "Billing is unavailable right now." }, { status: 500 });
    }
    await logAudit({
      actorEmail: session.email,
      action: "billing.checkout.started",
      propertyId,
      ip: clientIp(req),
    });
    return NextResponse.json({ url: checkout.url });
  } catch {
    return NextResponse.json({ error: "Billing is unavailable right now." }, { status: 500 });
  }
}
