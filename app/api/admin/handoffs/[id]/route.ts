// Single-handoff admin API (session auth for the in-app /staff board).
//   GET   /api/admin/handoffs/[id]?propertyId=<id> -> record + transcript + notes
//   PATCH /api/admin/handoffs/[id] { propertyId, status?, assignee? }
// Tenant rule (same as bridge): the id alone never confirms a row — a
// handoff from another property answers 404, never 403.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { isBridgeStatus } from "@/lib/bridge";

async function gate(propertyId: string) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to view handoffs." }, { status: 403 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  return null;
}

function shape(h: {
  id: string;
  conversationId: string;
  reason: string;
  summary: string;
  status: string;
  assignee: string | null;
  createdAt: Date;
  notes: { id: string; author: string; body: string; createdAt: Date }[];
  conversation: { messages: { role: string; content: string; createdAt: Date }[] };
}) {
  return {
    id: h.id,
    conversationId: h.conversationId,
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
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "";
  const denied = await gate(propertyId);
  if (denied) return denied;
  const { id } = await params;
  const handoff = await prisma.handoffRecord.findFirst({
    where: { id, conversation: { propertyId } },
    include: {
      notes: { orderBy: { createdAt: "asc" } },
      conversation: { select: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!handoff) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  return NextResponse.json(shape(handoff));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  const denied = await gate(propertyId);
  if (denied) return denied;
  const { id } = await params;
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
    return NextResponse.json(
      { error: "Nothing to update. Send status and/or assignee." },
      { status: 400 }
    );
  }
  const existing = await prisma.handoffRecord.findFirst({
    where: { id, conversation: { propertyId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  await prisma.handoffRecord.update({ where: { id }, data: updates });
  const handoff = await prisma.handoffRecord.findFirst({
    where: { id, conversation: { propertyId } },
    include: {
      notes: { orderBy: { createdAt: "asc" } },
      conversation: { select: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!handoff) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  return NextResponse.json(shape(handoff));
}
