// Billing overage toggle (Phase 3): the owner opts past the 120%
// hard stop (or back under it). OWNER + verified email only. Audit-
// logged both ways. Copy stays figure-free until prices publish —
// the page names the toggle without a per-conversation rate, and
// overage CONVERSATIONS are counted on the billing page for manual
// invoicing until metered billing ships. Honored by the quota gate
// only with a live subscription (a trial has no card, so trial
// overage always stops).
// SERVICE PATH (marked): subscription writes by verified session.
import { NextRequest, NextResponse } from "next/server";
import { prismaService } from "@/lib/prisma";
import { getSession, sessionOwnerVerified } from "@/lib/tenant";
import { clientIp, logAudit } from "@/lib/audit";

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
  const allow = body?.allow;
  if (typeof allow !== "boolean") {
    return NextResponse.json({ error: "allow must be true or false." }, { status: 400 });
  }
  const db = prismaService();
  const propertyId = session.propertyId;
  const sub = await db.subscription.findUnique({ where: { propertyId } }).catch(() => null);
  if (!sub) {
    return NextResponse.json({ error: "This property has no billing record yet." }, { status: 400 });
  }
  await db.subscription
    .update({ where: { propertyId }, data: { overageAgreed: allow } })
    .catch(() => null);
  await logAudit({
    actorEmail: session.email,
    action: allow ? "billing.overage.allowed" : "billing.overage.revoked",
    propertyId,
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: true, overageAgreed: allow });
}
