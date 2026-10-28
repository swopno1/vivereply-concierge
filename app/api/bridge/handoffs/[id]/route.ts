// Bridge API: handoff detail + modify (server-to-server).
//   GET   /api/bridge/handoffs/[id] -> record + notes + full transcript
//   PATCH /api/bridge/handoffs/[id] { status?, assignee? } -> updated record
// Closing is PATCH { status: "CLOSED" }. Assignee is a free label (staff
// name); null clears it. An id from another property — or no property —
// is a 404 either way, so callers cannot probe for other properties'
// handoffs by watching status codes.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isBridgeStatus, verifyBridgeRequest } from "@/lib/bridge";

async function inProperty(propertyId: string, id: string) {
  return prisma.handoffRecord.findFirst({
    where: { id, conversation: { propertyId } },
    include: {
      notes: { orderBy: { createdAt: "asc" } },
      conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });
}

function shape(h: NonNullable<Awaited<ReturnType<typeof inProperty>>>, propertyId: string) {
  return {
    id: h.id,
    conversationId: h.conversationId,
    propertyId,
    reason: h.reason,
    summary: h.summary,
    status: h.status,
    assignee: h.assignee,
    createdAt: h.createdAt.toISOString(),
    notes: h.notes.map((n) => ({
      id: n.id,
      author: n.author,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
    })),
    transcript: h.conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyBridgeRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing bridge credential." }, { status: 401 });
  }
  const { id } = await params;
  const handoff = await inProperty(auth.propertyId, id);
  if (!handoff) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  return NextResponse.json(shape(handoff, auth.propertyId));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyBridgeRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing bridge credential." }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const updates: { status?: string; assignee?: string | null } = {};
  if (body?.status !== undefined) {
    if (!isBridgeStatus(body.status)) {
      return NextResponse.json(
        { error: "Unknown status. Use OPEN, IN_PROGRESS, or CLOSED." },
        { status: 400 }
      );
    }
    updates.status = body.status;
  }
  if (body?.assignee !== undefined) {
    if (body.assignee !== null && (typeof body.assignee !== "string" || body.assignee.length > 100)) {
      return NextResponse.json(
        { error: "Assignee must be a name up to 100 characters, or null to clear." },
        { status: 400 }
      );
    }
    updates.assignee = body.assignee;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update. Send status and/or assignee." }, { status: 400 });
  }
  const existing = await prisma.handoffRecord.findFirst({
    where: { id, conversation: { propertyId: auth.propertyId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  await prisma.handoffRecord.update({ where: { id }, data: updates });
  const handoff = await inProperty(auth.propertyId, id);
  if (!handoff) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  return NextResponse.json(shape(handoff, auth.propertyId));
}
