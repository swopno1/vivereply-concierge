// Staff-reply admin API (session auth for the in-app /staff board).
//   POST /api/admin/handoffs/[id]/replies { propertyId, author, body }
// Same validation, behaviour, and side effects as the bridge replies
// route — the reply lands in the guest's thread as a role "staff"
// message. Only the credential differs (session cookie instead of
// bridge key), so propertyId rides in the body like the other admin
// handoff routes.
import { NextRequest, NextResponse } from "next/server";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { tenantFor, withTenant } from "@/lib/tenant-db";
import { clientIp, logAudit } from "@/lib/audit";
import {
  HandoffClosedError,
  appendStaffReply,
  validateReplyInput,
} from "@/lib/handoffs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to view handoffs." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  const { id } = await params;
  const valid = validateReplyInput(body);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }
  const tenant = tenantFor(session, propertyId);
  if (!tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const handoff = await withTenant(tenant, (tx) =>
    tx.handoffRecord.findFirst({
      where: { id, conversation: { propertyId } },
      include: { conversation: { select: { id: true, language: true } } },
    })
  );
  if (!handoff) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  if (handoff.status === "CLOSED") {
    return NextResponse.json(
      { error: "This handoff is closed. Reopen it before replying." },
      { status: 409 }
    );
  }
  const lang = handoff.conversation.language === "bn" ? "bn" : "en";
  try {
    const result = await withTenant(tenant, (tx) =>
      appendStaffReply(tx, {
        handoffId: id,
        conversationId: handoff.conversationId,
        author: valid.author,
        body: valid.body,
        lang,
      })
    );
    await logAudit({
      actorEmail: session.email,
      action: "admin.handoff_reply",
      propertyId,
      detail: { handoffId: id, author: valid.author },
      ip: clientIp(req),
    });
    return NextResponse.json(
      {
        message: {
          id: result.message.id,
          role: result.message.role,
          author: result.message.author,
          content: result.message.content,
          createdAt: result.message.createdAt.toISOString(),
        },
        handoff: { id, status: result.handoffStatus },
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof HandoffClosedError) {
      return NextResponse.json(
        { error: "This handoff is closed. Reopen it before replying." },
        { status: 409 }
      );
    }
    console.error("Admin reply error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save the reply." }, { status: 500 });
  }
}
