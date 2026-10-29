// Manual-payment confirmation (booking payments, staff only).
// Card links flip via the Stripe webhook exclusively — this endpoint
// refuses non-manual rows, so a card payment can never be faked by hand.

import { NextRequest, NextResponse } from "next/server";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { formatTaka } from "@/demo-config/rates";
import { sendPaymentConfirmationEmail } from "@/lib/email";
import { markManualPaid, paymentsEnabledGlobal } from "@/lib/payments";
import { clientIp, logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!paymentsEnabledGlobal()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  const manualReference = typeof body?.manualReference === "string" ? body.manualReference.trim() : "";
  if (!id || !sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }
  const paid = await markManualPaid(id, propertyId, manualReference || undefined).catch(() => null);
  if (!paid) {
    return NextResponse.json(
      { error: "Only pending manual transfers can be confirmed here." },
      { status: 400 }
    );
  }
  await logAudit({
    actorEmail: session.email,
    action: "payment.confirm",
    propertyId,
    detail: { bookingCode: paid.bookingCode, reference: paid.manualReference ?? null },
    ip: clientIp(req),
  });
  if (paid.guestEmail) {
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
      console.error("Payment receipt email failed:", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ confirmed: true });
}
