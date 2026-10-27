import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agent";
import { TOOL_DEFINITIONS, createToolExecutor, type ToolDb } from "@/lib/tools";
import { systemPrompt } from "@/lib/prompts";
import { detectLanguage } from "@/lib/language";
import { buildCards } from "@/lib/cards";
import { embedText } from "@/lib/embeddings";
import { retrieveGrounding, toVectorLiteral } from "@/lib/rag";
import { verifyChatToken } from "@/lib/auth";
import { isDomainApproved } from "@/lib/domains";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  // Step 4.5: every chat call must carry a signed token (direct
  // token from / or widget token from the handshake). The token's
  // propertyId governs — a propertyId sent by the browser is ignored
  // entirely, so a client can no longer claim any property. A widget
  // token's domain is re-checked against the approved list on every
  // message, so deactivating a domain stops its widget immediately.
  const chatToken = verifyChatToken(typeof body?.token === "string" ? body.token : null);
  if (!chatToken) {
    return NextResponse.json(
      { error: "Chat token expired or invalid. Please reload the page." },
      { status: 403 }
    );
  }
  if (chatToken.scope === "widget") {
    if (!chatToken.domain || !(await isDomainApproved(chatToken.propertyId, chatToken.domain))) {
      return NextResponse.json(
        { error: "This site is no longer approved to host this chat." },
        { status: 403 }
      );
    }
  }

  const incomingId = typeof body?.conversationId === "string" ? body.conversationId : "";
  let conversation = incomingId
    ? await prisma.conversation.findUnique({ where: { id: incomingId } })
    : null;
  // A conversation id from another property is ignored, never reused:
  // it would otherwise let one site's token read another's thread.
  if (conversation && conversation.propertyId !== chatToken.propertyId) {
    conversation = null;
  }
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        propertyId: chatToken.propertyId,
        language: "en",
      },
    });
  }

  // Language follows the guest's latest real language, both ways: a
  // Bengali-letter message switches to Bengali, an English-letter
  // message switches back. Neutral messages (dates, prices, "৳15,000"
  // alone) return null and leave the language unchanged, so a
  // conversation can never get stuck by a currency sign again.
  const detected = detectLanguage(message);
  if (detected && detected !== conversation.language) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { language: detected },
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

    // Step 2b: cards are built from this turn's tool logs only, so the
    // UI can never show a quote or draft from an earlier conversation.
    const turnStart = new Date();

    // Step 3 (RAG — supporting only, never the headline): retrieve
    // seeded property knowledge for this turn's question. Retrieval
    // failure is NOT fatal: the agent then runs without grounding and
    // must say it does not know property facts instead of inventing.
    let grounding: string | null = null;
    try {
      const retrieved = await retrieveGrounding({
        query: message,
        embed: embedText,
        search: async (embedding) => {
          const rows = await prisma.$queryRaw<
            Array<{ title: string; content: string; similarity: number }>
          >`SELECT d."title", c."content", 1 - (c."embedding" <=> ${toVectorLiteral(embedding)}::vector) AS "similarity" FROM "KnowledgeChunk" AS c JOIN "KnowledgeDocument" AS d ON d."id" = c."documentId" ORDER BY c."embedding" <=> ${toVectorLiteral(embedding)}::vector ASC LIMIT 4`;
          return rows;
        },
      });
      grounding = retrieved.text;
      if (retrieved.chunks.length > 0) {
        await prisma.toolCallLog.create({
          data: {
            conversationId: conversation.id,
            toolName: "rag_retrieval",
            input: { query: message } as never,
            output: { chunks: retrieved.chunks } as never,
          },
        });
      }
    } catch (e) {
      console.error(
        "RAG retrieval failed, continuing without grounding:",
        e instanceof Error ? e.message : e
      );
    }

    const { reply } = await runAgent({
      messages: [
        {
          role: "system",
          content: systemPrompt(conversation.language === "bn" ? "bn" : "en", grounding),
        },
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
    const turnLogs = await prisma.toolCallLog.findMany({
      where: { conversationId: conversation.id, createdAt: { gte: turnStart } },
      orderBy: { createdAt: "asc" },
    });
    const cards = buildCards(
      turnLogs.map((l) => ({ toolName: l.toolName, input: l.input, output: l.output }))
    );
    return NextResponse.json({ reply, conversationId: conversation.id, cards });
  } catch (err) {
    console.error("Agent error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "The assistant is unavailable right now. Please try again." },
      { status: 502 }
    );
  }
}
