// Booking-payments admin API (suite users, flag-gated).
//   GET  /api/admin/payments?propertyId=<id> -> recent links (never tokens)
//   POST /api/admin/payments/mark-paid { id, propertyId, manualReference? }
// Staff confirm MANUAL transfers here; card links flip only via the
// Stripe webhook, never by hand. Session + tenant + verification gated
// like every other owner admin route.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { formatTaka } from "@/demo-config/rates";
import { sendPaymentConfirmationEmail } from "@/lib/email";
import { markManualPaid, paymentsEnabledGlobal } from "@/lib/payments";

async function gate(propertyId: string) {
  const session = await getSession();
  if (!session) return { status: 401 as const, error: "Not authorized." };
  if (!paymentsEnabledGlobal()) return { status: 404 as const, error: "Not found." };
  if (!(await sessionOwnerVerified(session))) {
    return { status: 403 as const, error: "Verify your email to configure your resort." };
  }
  if (!sessionCan(session, propertyId)) {
    return { status: 403 as const, error: "Not authorized for this property." };
  }
  return null;
}

function shape(row: {
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
  paidAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}) {
  return {
    id: row.id,
    bookingCode: row.bookingCode,
    method: row.method,
    status: row.status,
    amountPoisha: row.amountPoisha,
    guestFirstName: row.guestFirstName,
    room: row.room,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    manualReference: row.manualReference,
    paidAt: row.paidAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "";
  const denied = await gate(propertyId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const rows = await prisma.paymentLink.findMany({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(rows.map(shape));
}
