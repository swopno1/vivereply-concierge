// Staff handoffs admin API (session auth for the in-app /staff board).
//   GET /api/admin/handoffs?propertyId=<id>&status=OPEN -> { rows, counts }
// Same workflow as the bridge routes, same validation, same shapes —
// only the credential differs (session cookie instead of bridge key).
// rows carry noteCount, not bodies: the board fetches one transcript at
// a time. counts powers the filter tabs without a second round-trip.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { isBridgeStatus } from "@/lib/bridge";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to view handoffs." }, { status: 403 });
  }
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "";
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam !== null && !isBridgeStatus(statusParam)) {
    return NextResponse.json(
      { error: "Unknown status. Use OPEN, IN_PROGRESS, or CLOSED." },
      { status: 400 }
    );
  }
  const where = { conversation: { propertyId } };
  const [rows, grouped] = await Promise.all([
    prisma.handoffRecord.findMany({
      where: { ...where, ...(statusParam ? { status: statusParam } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        _count: { select: { notes: true } },
        conversation: { select: { language: true } },
      },
    }),
    prisma.handoffRecord.groupBy({
      by: ["status"],
      where,
      _count: { status: true },
    }),
  ]);
  const counts: Record<string, number> = { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 };
  for (const g of grouped) {
    if (g.status in counts) counts[g.status] = g._count.status;
  }
  return NextResponse.json({
    rows: rows.map((h) => ({
      id: h.id,
      conversationId: h.conversationId,
      reason: h.reason,
      summary: h.summary,
      status: h.status,
      assignee: h.assignee,
      language: h.conversation.language,
      createdAt: h.createdAt.toISOString(),
      noteCount: h._count.notes,
    })),
    counts,
  });
}
