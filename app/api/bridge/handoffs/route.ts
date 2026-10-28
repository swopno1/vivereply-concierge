// Bridge API: list handoffs for the caller's property (server-to-server,
// plus the staff iframe widget).
//   GET /api/bridge/handoffs?status=OPEN
// Auth: Authorization: Bearer <bridge key> or <embed token> (keys minted
// in Settings; embed tokens via POST /api/bridge/embed-tokens).
// Everything is scoped to the token's propertyId — another property's
// handoffs are invisible here, not merely forbidden. Optional ?status=
// filters to one status; an unknown status is a 400, never a silent all.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isBridgeStatus, verifyBridgeRequest } from "@/lib/bridge";

export async function GET(req: NextRequest) {
  const auth = await verifyBridgeRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing bridge credential." }, { status: 401 });
  }
  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam !== null && !isBridgeStatus(statusParam)) {
    return NextResponse.json(
      { error: "Unknown status. Use OPEN, IN_PROGRESS, or CLOSED." },
      { status: 400 }
    );
  }
  const rows = await prisma.handoffRecord.findMany({
    where: {
      conversation: { propertyId: auth.propertyId },
      ...(statusParam ? { status: statusParam } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      notes: { orderBy: { createdAt: "asc" } },
      _count: { select: { notes: true } },
    },
  });
  return NextResponse.json(
    rows.map((h) => ({
      id: h.id,
      conversationId: h.conversationId,
      propertyId: auth.propertyId,
      reason: h.reason,
      summary: h.summary,
      status: h.status,
      assignee: h.assignee,
      createdAt: h.createdAt.toISOString(),
      noteCount: h._count.notes,
      notes: h.notes.map((n) => ({
        id: n.id,
        author: n.author,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
      })),
    }))
  );
}
