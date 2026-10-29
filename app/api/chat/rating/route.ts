// Guest helpful vote (one-tap post-chat rating).
//   POST /api/chat/rating { token, conversationId, helpful } -> { saved }
// Gated exactly like a chat message: the signed token governs, the
// conversation must belong to the token's property (a foreign id is
// ignored, never an error to probe with), and suspended properties
// can't vote. Upsert: one row per conversation, freely changeable.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyChatToken } from "@/lib/auth";
import { isDomainApproved } from "@/lib/domains";
import { isPropertyActive } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const chatToken = verifyChatToken(typeof body?.token === "string" ? body.token : null);
  if (!chatToken) {
    return NextResponse.json({ error: "Chat token expired or invalid." }, { status: 403 });
  }
  if (!(await isPropertyActive(chatToken.propertyId))) {
    return NextResponse.json({ error: "Chat is unavailable right now." }, { status: 403 });
  }
  if (chatToken.scope === "widget") {
    if (!chatToken.domain || !(await isDomainApproved(chatToken.propertyId, chatToken.domain))) {
      return NextResponse.json({ error: "This site is no longer approved." }, { status: 403 });
    }
  }
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const helpful = body?.helpful;
  if (!conversationId || typeof helpful !== "boolean") {
    return NextResponse.json({ error: "conversationId and helpful are required." }, { status: 400 });
  }
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.propertyId !== chatToken.propertyId) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  await prisma.chatRating.upsert({
    where: { conversationId },
    create: { conversationId, helpful },
    update: { helpful },
  });
  return NextResponse.json({ saved: true });
}
