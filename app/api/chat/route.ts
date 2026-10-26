import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chatCompletion } from "@/lib/meta";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const incomingId = typeof body?.conversationId === "string" ? body.conversationId : "";
  let conversation = incomingId
    ? await prisma.conversation.findUnique({ where: { id: incomingId } })
    : null;
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        propertyId: process.env.DEMO_PROPERTY_ID ?? "krishnachura-retreat",
        language: "en",
      },
    });
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, role: "user", content: message },
  });

  try {
    // Full history (last 20 turns) so the bot is genuinely conversational.
    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    const { reply, usage } = await chatCompletion(
      history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }))
    );

    await prisma.message.create({
      data: { conversationId: conversation.id, role: "assistant", content: reply },
    });
    await prisma.toolCallLog.create({
      data: {
        conversationId: conversation.id,
        toolName: "model_call",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        reasoningTokens: usage.reasoningTokens,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json({ reply, conversationId: conversation.id });
  } catch (err) {
    console.error("Meta API error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "The assistant is unavailable right now. Please try again." },
      { status: 502 }
    );
  }
}
