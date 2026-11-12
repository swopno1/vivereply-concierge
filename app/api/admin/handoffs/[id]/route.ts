// Single-handoff admin API (session auth for the in-app /staff board).
//   GET   /api/admin/handoffs/[id]?propertyId=<id> -> record + transcript + notes
//   PATCH /api/admin/handoffs/[id] { propertyId, status?, assignee? }
// Tenant rule (same as bridge): the id alone never confirms a row — a
// handoff from another property answers 404, never 403.

import { NextRequest, NextResponse } from "next/server";
import { getSession, sessionCan, sessionOwnerVerified, type Session } from "@/lib/tenant";
import { tenantFor, withTenant } from "@/lib/tenant-db";
import { isBridgeStatus } from "@/lib/bridge";
import { applyHandoffSideEffects, type HandoffTransition } from "@/lib/handoffs";

async function gate(propertyId: string): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to view handoffs." }, { status: 403 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  return session;
}

function tenantOr401(session: Session, propertyId: string): string | NextResponse {
  const tenant = tenantFor(session, propertyId);
  if (!tenant) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return tenant;
}

function shape(h: {
  id: string;
  conversationId: string;
  reason: string;
  summary: string;
  status: string;
  assignee: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  createdAt: Date;
  notes: { id: string; author: string; body: string; createdAt: Date }[];
  conversation: { messages: { role: string; author: string | null; content: string; createdAt: Date }[] };
}) {
  // §2c: transcript entries carry author; the last entry doubles as the
  // triage pair (same values the list computes with its batched query).
  const transcript = h.conversation.messages;
  const last = transcript.length > 0 ? transcript[transcript.length - 1] : null;
  return {
    id: h.id,
    conversationId: h.conversationId,
    reason: h.reason,
    summary: h.summary,
    status: h.status,
    assignee: h.assignee,
    guestPhone: h.guestPhone,
    guestEmail: h.guestEmail,
    lastMessageRole: last?.role ?? null,
    lastMessageAt: last ? last.createdAt.toISOString() : null,
    createdAt: h.createdAt.toISOString(),
    notes: h.notes.map((n) => ({
      id: n.id,
      author: n.author,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
    })),
    transcript: transcript.map((m) => ({
      role: m.role,
      author: m.author,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "";
  const gated = await gate(propertyId);
  if (gated instanceof NextResponse) return gated;
  const tenant = tenantOr401(gated, propertyId);
  if (tenant instanceof NextResponse) return tenant;
  const { id } = await params;
  const handoff = await withTenant(tenant, (tx) =>
    tx.handoffRecord.findFirst({
      where: { id, conversation: { propertyId } },
      include: {
        notes: { orderBy: { createdAt: "asc" } },
        conversation: { select: { messages: { orderBy: { createdAt: "asc" } } } },
      },
    })
  );
  if (!handoff) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  return NextResponse.json(shape(handoff));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  const gated = await gate(propertyId);
  if (gated instanceof NextResponse) return gated;
  const tenant = tenantOr401(gated, propertyId);
  if (tenant instanceof NextResponse) return tenant;
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
  const existing = await withTenant(tenant, (tx) =>
    tx.handoffRecord.findFirst({
      where: { id, conversation: { propertyId } },
      include: { conversation: { select: { language: true } } },
    })
  );
  if (!existing) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  // Same hand-back / re-pause side effects as the bridge PATCH (§2b),
  // through the shared helper — close of the last active handoff
  // returns the guest to the bot (bot-return line included).
  const transition: HandoffTransition =
    updates.status === "CLOSED" && existing.status !== "CLOSED"
      ? "close"
      : existing.status === "CLOSED" && updates.status !== undefined && updates.status !== "CLOSED"
        ? "reopen"
        : "other";
  const lang = existing.conversation.language === "bn" ? "bn" : "en";
  await withTenant(tenant, async (tx) => {
    await tx.handoffRecord.update({ where: { id }, data: updates });
    await applyHandoffSideEffects(tx, { conversationId: existing.conversationId, transition, lang });
  });
  const handoff = await withTenant(tenant, (tx) =>
    tx.handoffRecord.findFirst({
      where: { id, conversation: { propertyId } },
      include: {
        notes: { orderBy: { createdAt: "asc" } },
        conversation: { select: { messages: { orderBy: { createdAt: "asc" } } } },
      },
    })
  );
  if (!handoff) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  return NextResponse.json(shape(handoff));
}
