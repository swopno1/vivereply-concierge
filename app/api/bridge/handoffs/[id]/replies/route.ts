// Bridge API: staff reply to the guest (server-to-server).
//   POST /api/bridge/handoffs/[id]/replies { author, body } -> message + handoff (201)
// The reply lands in the guest's thread as a role "staff" message; the
// widget picks it up on its next poll. First reply on the conversation
// is preceded by a staff-joined system line. An OPEN handoff moves to
// IN_PROGRESS; a CLOSED one rejects with 409 (reopen first). Same 404
// rule as the rest of the bridge: another property's id looks exactly
// like a missing one. Validation mirrors the notes route.
import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant-db";
import { verifyBridgeRequest } from "@/lib/bridge";
import { logAudit } from "@/lib/audit";
import {
  HandoffClosedError,
  appendStaffReply,
  validateReplyInput,
} from "@/lib/handoffs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyBridgeRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing bridge credential." }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const valid = validateReplyInput(body);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }
  const handoff = await withTenant(auth.propertyId, (tx) =>
    tx.handoffRecord.findFirst({
      where: { id, conversation: { propertyId: auth.propertyId } },
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
    const result = await withTenant(auth.propertyId, (tx) =>
      appendStaffReply(tx, {
        handoffId: id,
        conversationId: handoff.conversationId,
        author: valid.author,
        body: valid.body,
        lang,
      })
    );
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await logAudit({
      action: "bridge.handoff_reply",
      propertyId: auth.propertyId,
      detail: { handoffId: id, author: valid.author },
      ip,
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
    // Racing close: the handoff shut between the read above and the
    // write. Same 409 as the pre-check — staff reopens, then retries.
    if (e instanceof HandoffClosedError) {
      return NextResponse.json(
        { error: "This handoff is closed. Reopen it before replying." },
        { status: 409 }
      );
    }
    console.error("Bridge reply error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save the reply." }, { status: 500 });
  }
}
