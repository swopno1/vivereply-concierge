// Billing change-plan (Phase 3): moves an ACTIVE subscription to a
// different tier/interval via the Stripe API (Stripe prorates the
// difference by default). OWNER + verified email only. The row
// updates optimistically after Stripe accepts; the webhook re-sets
// the same values seconds later (convergent). Downgrading below
// current usage is allowed — the quota gate simply enforces the new
// limit from then on (the page says so before confirming).
// SERVICE PATH (marked): subscription writes by verified session.
import { NextRequest, NextResponse } from "next/server";
import { prismaService } from "@/lib/prisma";
import { getSession, sessionOwnerVerified } from "@/lib/tenant";
import { clientIp, logAudit } from "@/lib/audit";
import { VALID_INTERVALS, VALID_TIERS } from "@/lib/billing";
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
  const sub = await db.subscription.findUnique({ where: { propertyId } }).catch(() => null);
  if (!sub?.stripeSubscriptionId || (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE")) {
    return NextResponse.json(
      { error: "This property has no subscription to change — subscribe first." },
      { status: 409 }
    );
  }
  if (sub.tier === tier && sub.interval === interval) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  let client;
  try {
    client = stripe();
  } catch {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
  }
  try {
    const current = await client.subscriptions.retrieve(sub.stripeSubscriptionId);
    const itemId = current.items?.data?.[0]?.id;
    if (!itemId) {
      return NextResponse.json({ error: "Billing is unavailable right now." }, { status: 500 });
    }
    await client.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price }],
      metadata: { propertyId, tier, interval },
      proration_behavior: "create_prorations",
    });
    await db.subscription.update({
      where: { propertyId },
      data: { tier, interval },
    });
    await logAudit({
      actorEmail: session.email,
      action: "billing.plan.changed",
      propertyId,
      detail: { tier, interval },
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Billing is unavailable right now." }, { status: 500 });
  }
}
