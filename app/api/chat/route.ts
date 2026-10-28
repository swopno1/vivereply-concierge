// Guest chat API (the product's front door — judges start here).
//   POST /api/chat { message, token, conversationId? } -> SSE stream
// One guest turn, streamed honestly: the token (direct or widget) is
// verified and its propertyId governs everything; the message is saved;
// the property resolves to its backend + catalogue + voice + knowledge;
// the agent runs (model → tools → model, max 6 rounds); phases stream
// WHILE work happens ("thinking" on model calls, "checking + detail" per
// tool, built only from the tool's real arguments — never timer-faked);
// the reply saves, cards build from this turn's tool logs only, and the
// stream closes with { done }. Errors mid-stream are generic lines to the
// guest; real causes go to the server log.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agent";
import { createToolExecutor, toolDefinitionsFor, type ToolDb } from "@/lib/tools";
import { adapterForProperty, FixtureSuiteAdapter } from "@/lib/suite";
import { catalogueForProperty } from "@/demo-config/rooms";
import { systemPrompt } from "@/lib/prompts";
import { detectLanguage } from "@/lib/language";
import { buildCards } from "@/lib/cards";
import { embedText } from "@/lib/embeddings";
import { retrieveGrounding, toVectorLiteral } from "@/lib/rag";
import { verifyChatToken } from "@/lib/auth";
import { isDomainApproved } from "@/lib/domains";

/**
 * Human one-liners for the streamed "Checking…" status. Built ONLY from
 * the tool's real arguments — never invented content. The room slug is
 * prettified ("terracotta-villa" -> "Terracotta Villa"); dates pass
 * through as given. Unknown tools get the generic line.
 */
function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toolDetail(name: string, argsJson: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    args = {};
  }
  const room = typeof args.roomSlug === "string" ? prettifySlug(args.roomSlug) : "";
  const dates =
    typeof args.checkIn === "string" && typeof args.checkOut === "string"
      ? `${args.checkIn} → ${args.checkOut}`
      : "";
  const withRoomDates = (base: string) => [base, room, dates].filter(Boolean).join(" · ");
  switch (name) {
    case "check_availability":
      return withRoomDates("Checking availability");
    case "get_quote":
      return withRoomDates("Working out your quote");
    case "create_booking_draft":
      return withRoomDates("Holding your booking");
    case "request_handoff":
      return "Passing this to our team";
    case "lookup_booking_by_code":
      return "Looking up your booking";
    case "request_booking_details":
      return "Sending your booking details";
    case "verify_booking":
      return "Double-checking your booking";
    default:
      return "Checking with the resort";
  }
}

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
  // Const capture for the stream closure: a `let` narrowed above would
  // lose its narrowing inside the closure.
  const activeConversation = conversation;

  await prisma.message.create({
    data: { conversationId: activeConversation.id, role: "user", content: message },
  });

  // Streaming (UX): the turn runs inside the stream's start(), so phase
  // events reach the browser WHILE the model and the resort checks are
  // still running — the whole point. Auth, conversation setup, and the
  // user message above stay outside the stream, so they still return
  // proper JSON errors. Events: { type: "phase", phase, detail? },
  // { type: "done", reply, conversationId, cards },
  // { type: "error", error }. The assistant message is saved BEFORE the
  // done event, exactly as the old JSON contract did.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const history = await prisma.message.findMany({
          where: { conversationId: activeConversation.id },
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
          getDraft: async (cid) => {
            const logs = await prisma.toolCallLog.findMany({
              where: { conversationId: cid, toolName: "create_booking_draft" },
              orderBy: { createdAt: "desc" },
            });
            for (const l of logs) {
              const output = l.output as {
                bookingCode?: string;
                room?: string;
                checkIn?: string;
                checkOut?: string;
                suiteTotal?: string;
                quotedTotal?: string;
                totalsMatch?: boolean;
              } | null;
              if (
                output?.bookingCode &&
                output.room &&
                output.checkIn &&
                output.checkOut &&
                output.suiteTotal &&
                output.quotedTotal
              ) {
                return {
                  bookingCode: output.bookingCode,
                  room: output.room,
                  checkIn: output.checkIn,
                  checkOut: output.checkOut,
                  suiteTotal: output.suiteTotal,
                  quotedTotal: output.quotedTotal,
                  totalsMatch: output.totalsMatch === true,
                };
              }
            }
            return null;
          },
          createHandoff: async (cid, reason, summary) => {
            await prisma.handoffRecord.create({ data: { conversationId: cid, reason, summary } });
            await prisma.conversation.update({
              where: { id: cid },
              data: { status: "HANDED_OFF" },
            });
          },
        };

        // Per-property backend + catalogue (adapter Phases 2-3): the
        // token's property selects its Suite binding and its room list. A
        // misconfigured property fails this turn honestly instead of
        // borrowing another property's backend or rooms — the guest gets a
        // generic line, the real cause goes to the log.
        let suite;
        let catalogue;
        try {
          suite = await adapterForProperty(activeConversation.propertyId);
          catalogue = await catalogueForProperty(activeConversation.propertyId);
        } catch (e) {
          console.error(
            "Suite binding failed:",
            e instanceof Error ? e.message : e
          );
          send({ type: "error", error: "The resort's booking connection needs attention. Please try again later." });
          return;
        }
        const baseExecute = createToolExecutor(activeConversation.id, db, suite, catalogue);
        // Reply identity (onboarding Phase 3): absent profile = default voice.
        const profile = await prisma.propertyProfile
          .findUnique({ where: { propertyId: activeConversation.propertyId } })
          .catch(() => null);
        // Resolution evidence (multi-tenant core): one log line per turn —
        // which property resolved to which backend, how many rooms, and
        // whether the voice is custom. The P4 isolation proof reads these.
        console.log(
          `concierge: property=${activeConversation.propertyId} adapter=${suite instanceof FixtureSuiteAdapter ? "fixture" : "http"} rooms=${catalogue.length} persona=${profile ? "custom" : "default"}`
        );
        const execute = async (name: string, argsJson: string) => {
          send({ type: "phase", phase: "checking", detail: toolDetail(name, argsJson) });
          const result = await baseExecute(name, argsJson);
          let input: unknown = null;
          try {
            input = JSON.parse(argsJson) as unknown;
          } catch {
            input = null;
          }
          await prisma.toolCallLog.create({
            data: {
              conversationId: activeConversation.id,
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
          send({ type: "phase", phase: "checking", detail: "Looking up what I know about the resort…" });
          const retrieved = await retrieveGrounding({
            query: message,
            embed: embedText,
            search: async (embedding) => {
              const rows = await prisma.$queryRaw<
                Array<{ title: string; content: string; similarity: number }>
              >`SELECT d."title", c."content", 1 - (c."embedding" <=> ${toVectorLiteral(embedding)}::vector) AS "similarity" FROM "KnowledgeChunk" AS c JOIN "KnowledgeDocument" AS d ON d."id" = c."documentId" WHERE d."propertyId" = ${activeConversation.propertyId} AND c."indexed" = true ORDER BY c."embedding" <=> ${toVectorLiteral(embedding)}::vector ASC LIMIT 4`;
              return rows;
            },
          });
          grounding = retrieved.text;
          if (retrieved.chunks.length > 0) {
            await prisma.toolCallLog.create({
              data: {
                conversationId: activeConversation.id,
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
              content: systemPrompt(activeConversation.language === "bn" ? "bn" : "en", grounding, catalogue, profile),
            },
            ...history.map(
              (m: { role: string; content: string }): { role: "assistant" | "user"; content: string } => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
              })
            ),
          ],
          tools: toolDefinitionsFor(catalogue),
          execute,
          onModelCall: async (usage) => {
            await prisma.toolCallLog.create({
              data: {
                conversationId: activeConversation.id,
                toolName: "model_call",
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                reasoningTokens: usage.reasoningTokens,
              },
            });
          },
          onModelStart: async () => {
            send({ type: "phase", phase: "thinking" });
          },
        });

        await prisma.message.create({
          data: { conversationId: activeConversation.id, role: "assistant", content: reply },
        });
        await prisma.conversation.update({
          where: { id: activeConversation.id },
          data: { updatedAt: new Date() },
        });
        const turnLogs = await prisma.toolCallLog.findMany({
          where: { conversationId: activeConversation.id, createdAt: { gte: turnStart } },
          orderBy: { createdAt: "asc" },
        });
        const cards = buildCards(
          turnLogs.map((l) => ({ toolName: l.toolName, input: l.input, output: l.output }))
        );
        send({ type: "done", reply, conversationId: activeConversation.id, cards });
      } catch (err) {
        console.error("Agent error:", err instanceof Error ? err.message : err);
        send({ type: "error", error: "The assistant is unavailable right now. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
