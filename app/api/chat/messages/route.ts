// Guest thread API (widget delivery, §2d + A3).
//   GET /api/chat/messages?token=<widget token>&conversationId=<id>[&after=<messageId>]
// The widget's memory: history-on-mount (latest 50, no cursor) and the
// 10s poll (only messages after the cursor). Unknown cursor fails soft
// to the latest 50 — never an error. Response carries the STAFF/BOT
// mode, the contact-captured flag, and the resort's own contact, so one
// round-trip drives the banner, the form, and the thread.
import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant-db";
import { checkGuestMessagesRateByIp } from "@/lib/ratelimit";
import { verifyGuestThreadToken } from "@/lib/guest-thread";
import { latestActiveHandoff, shapeGuestThreadPayload } from "@/lib/handoffs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const auth = await verifyGuestThreadToken(q.get("token"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const limit = await checkGuestMessagesRateByIp(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many messages right now. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }
  const conversationId = q.get("conversationId") ?? "";
  const after = q.get("after");
  const tenant = auth.propertyId;
  // Cross-property ids read as missing (same rule as the chat route:
  // ignored, never reused — RLS confines the lookup too).
  const conversation = conversationId
    ? await withTenant(tenant, (tx) => tx.conversation.findUnique({ where: { id: conversationId } }))
    : null;
  if (!conversation || conversation.propertyId !== tenant) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  // Newest-first fetch, reversed to chronological (same window pattern
  // as the chat route's history read).
  const [desc, activeHandoff, profile] = await Promise.all([
    withTenant(tenant, (tx) =>
      tx.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    ),
    withTenant(tenant, (tx) => latestActiveHandoff(tx, conversationId)),
    withTenant(tenant, (tx) =>
      tx.propertyProfile.findUnique({
        where: { propertyId: tenant },
        select: { phone: true, email: true },
      })
    ).catch(() => null),
  ]);
  return NextResponse.json(
    shapeGuestThreadPayload({
      messagesAsc: [...desc].reverse(),
      after,
      activeHandoff,
      profile,
    })
  );
}
