// Guest contact capture (widget form, Amendment A2 path 1).
//   POST /api/chat/contact { token, conversationId, phone?, email? }
// Stores the validated fields on the active handoff (latest value wins
// per field) and appends the confirmation system line. Widget-token
// auth identical to the messages endpoint. At least one valid field is
// required; no active handoff answers 409 (the form only shows in STAFF
// mode, so this means the handoff closed mid-submit — retry lands on
// the holding line instead).
import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant-db";
import { verifyGuestThreadToken } from "@/lib/guest-thread";
import { validateContactForm } from "@/lib/guest-contact";
import { applyContactCapture } from "@/lib/handoffs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const auth = await verifyGuestThreadToken(typeof body?.token === "string" ? body.token : null);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const valid = validateContactForm(body);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const tenant = auth.propertyId;
  const conversation = conversationId
    ? await withTenant(tenant, (tx) => tx.conversation.findUnique({ where: { id: conversationId } }))
    : null;
  if (!conversation || conversation.propertyId !== tenant) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  const lang = conversation.language === "bn" ? "bn" : "en";
  const result = await withTenant(tenant, (tx) =>
    applyContactCapture(tx, {
      conversationId,
      phone: valid.phone,
      email: valid.email,
      lang,
    })
  );
  if (!result.captured) {
    return NextResponse.json(
      { error: "This conversation is not with our team right now." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
