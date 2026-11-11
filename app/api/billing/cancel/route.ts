// Billing cancel (Phase 3): ends the subscription at the period end
// (Stripe cancel_at_period_end) — access continues to the paid date,
// then the gate pauses like an expired trial. OWNER + verified email
// only. The row flips optimistically; the webhook confirms. Nothing
// is deleted, ever: data and settings stay put (90-day promise).
// SERVICE PATH (marked): subscription writes by verified session.
import { NextRequest, NextResponse } from "next/server";
import { prismaService } from "@/lib/prisma";
import { getSession, sessionOwnerVerified } from "@/lib/tenant";
import { clientIp, logAudit } from "@/lib/audit";
import { stripe } from "@/lib/stripe";

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
  const db = prismaService();
  const propertyId = session.propertyId;
  const sub = await db.subscription.findUnique({ where: { propertyId } }).catch(() => null);
  if (!sub?.stripeSubscriptionId || (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE")) {
    return NextResponse.json(
      { error: "This property has no subscription to cancel." },
      { status: 409 }
    );
  }
  if (sub.cancelAtPeriodEnd) {
    return NextResponse.json({ ok: true, alreadyCancelling: true });
  }

  let client;
  try {
    client = stripe();
  } catch {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
  }
  try {
    await client.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    await db.subscription.update({
      where: { propertyId },
      data: { cancelAtPeriodEnd: true },
    });
    await logAudit({
      actorEmail: session.email,
      action: "billing.subscription.cancelled",
      propertyId,
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Billing is unavailable right now." }, { status: 500 });
  }
}
