import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agent";
import { TOOL_DEFINITIONS, createToolExecutor, type ToolDb } from "@/lib/tools";
import { systemPrompt } from "@/lib/prompts";
import { detectLanguage } from "@/lib/language";

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

  // Language follows the guest: Bengali script switches the conversation
  // to Bengali for this and later turns.
  if (detectLanguage(message) === "bn" && conversation.language !== "bn") {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { language: "bn" },
    });
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, role: "user", content: message },
  });

  try {
    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const db: ToolDb = {
      hasQuote: async (cid, roomSlug, checkIn, checkOut) => {
        const logs = await prisma.toolCallLog.findMany({
          where: { conversationId: cid, toolName: "get_quote" },
        });
        return logs.some((l) => {
          const input = l.input as { roomSlug?: string; checkIn?: string; checkOut?: string } | null;
          return (
            input?.roomSlug === roomSlug && input?.checkIn === checkIn && input?.checkOut === checkOut
          );
        });
      },
      hasDraft: async (cid) => {
        const logs = await prisma.toolCallLog.findMany({
          where: { conversationId: cid, toolName: "create_booking_draft" },
        });
        return logs.some((l) => {
          const output = l.output as { bookingCode?: string } | null;
          return Boolean(output?.bookingCode);
        });
      },
      createHandoff: async (cid, reason, summary) => {
        await prisma.handoffRecord.create({ data: { conversationId: cid, reason, summary } });
        await prisma.conversation.update({
          where: { id: cid },
          data: { status: "HANDED_OFF" },
        });
      },
    };

    const baseExecute = createToolExecutor(conversation.id, db);
    const execute = async (name: string, argsJson: string) => {
      const result = await baseExecute(name, argsJson);
      let input: unknown = null;
      try {
        input = JSON.parse(argsJson) as unknown;
      } catch {
        input = null;
      }
      await prisma.toolCallLog.create({
        data: {
          conversationId: conversation.id,
          toolName: name,
          input: input as never,
          output: result as never,
        },
      });
      return result;
    };

    const { reply } = await runAgent({
      messages: [
        { role: "system", content: systemPrompt(conversation.language === "bn" ? "bn" : "en") },
        ...history.map(
          (m: { role: string; content: string }): { role: "assistant" | "user"; content: string } => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })
        ),
      ],
      tools: TOOL_DEFINITIONS,
      execute,
      onModelCall: async (usage) => {
        await prisma.toolCallLog.create({
          data: {
            conversationId: conversation.id,
            toolName: "model_call",
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            reasoningTokens: usage.reasoningTokens,
          },
        });
      },
    });

    await prisma.message.create({
      data: { conversationId: conversation.id, role: "assistant", content: reply },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json({ reply, conversationId: conversation.id });
  } catch (err) {
    console.error("Agent error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "The assistant is unavailable right now. Please try again." },
      { status: 502 }
    );
  }
}
