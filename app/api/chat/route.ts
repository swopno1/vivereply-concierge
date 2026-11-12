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
import { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/tenant-db";
import { answerBrand } from "@/lib/brand-knowledge";
import { runAgent } from "@/lib/agent";
import { createToolExecutor, toolDefinitionsFor, type ToolDb } from "@/lib/tools";
import { adapterForProperty } from "@/lib/suite";
import { catalogueForProperty } from "@/demo-config/rooms";
import { resolutionFailureRow, resolveBookingMode } from "@/lib/booking-mode";
import { systemPrompt } from "@/lib/prompts";
import { detectLanguage } from "@/lib/language";
import { buildCards } from "@/lib/cards";
import { embedText } from "@/lib/embeddings";
import { retrieveGrounding, toVectorLiteral } from "@/lib/rag";
import { capHistoryForModel } from "@/lib/history";
import { verifyChatToken } from "@/lib/auth";
import { isDomainApproved } from "@/lib/domains";
import { checkChatRate, checkChatRateByIp } from "@/lib/ratelimit";
import { isPropertyActive } from "@/lib/tenant";
import { resortPaymentUrl } from "@/lib/resort-pay";
import { formatTaka } from "@/demo-config/rates";
import { gateDecision, monthStartUtc, pauseMessage } from "@/lib/billing";
import { appendHandoffNotice, ensureConversationHandoff, runStaffModeTurn } from "@/lib/handoffs";

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
    case "get_resort_payment_link":
      return "Finding the resort's payment page";
    default:
      return "Checking with the resort";
  }
}

// Trivial-turn gate (cost): greetings, thanks, and acks carry no
// retrievable question, so they skip the embedding call AND the
// "Looking up…" phase entirely. Conservative by design — anything
// that is not clearly trivial still retrieves (a guessed skip is
// worse than a wasted embedding). EN + BN.
const TRIVIAL_MESSAGE =
  /^(hi|hey|hello|yo|thanks?|thank you|thx|ok|okay|sure|bye|good ?(morning|afternoon|evening|night)|how are you|হাই|হ্যালো|ধন্যবাদ|ঠিক আছে|বিদায়|কেমন আছেন?)[.!?\s।]*$/iu;

function needsRetrieval(message: string): boolean {
  const text = message.trim();
  if (text.length <= 2) return false;
  return !TRIVIAL_MESSAGE.test(text);
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
  // Brand mode: owner brand assistant (scope minted only for
  // super-admin with no property selected). Answered from the static
  // brand corpus — no property checks (there is no property), no
  // tools, no writes, no model calls. IP-throttled like everything
  // else; per-tenant throttle cannot apply without a tenant.
  if (chatToken.scope === "brand") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const byIp = await checkChatRateByIp(ip);
    if (!byIp.allowed) {
      return NextResponse.json(
        { error: "Too many messages right now. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(byIp.retryAfterSec) } }
      );
    }
    const { reply } = answerBrand(message);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", reply, cards: [], conversationId: null, replyRole: "assistant" })}\n\n`)
        );
        controller.close();
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
  // Tenant kill-switch: a suspended (or deleted) property gets no chat
  // on any scope, before any row is written. Generic wording — guests
  // must not learn tenant state.
  if (!(await isPropertyActive(chatToken.propertyId))) {
    return NextResponse.json(
      { error: "Chat is unavailable right now. Please try again in a moment." },
      { status: 403 }
    );
  }
  // Billing gate (Phase 3): trial-expiry, ended subscriptions, and
  // the 120% quota stop land HERE — before any row is written, before
  // the model spends a cent, on every scope (owners see the same
  // pause guests do; the banner + billing page explain why). No
  // Subscription row = grandfathered (demo, seeds, pre-Phase-3):
  // served, no clock. A pause answers as a NORMAL in-thread reply —
  // honest message + the resort's human contact — never an error
  // toast, never a 500, never a hallucinated quote. Paused turns
  // write nothing, so they consume no quota. A billing-READ failure
  // serves (fail open, logged): billing must never be the thing that
  // breaks guest chat — quota evasion during a DB outage is bounded
  // by the outage and audit-visible in the server log.
  {
    const now = new Date();
    const billing = await withTenant(chatToken.propertyId, (tx) =>
      tx.subscription.findUnique({ where: { propertyId: chatToken.propertyId } })
    ).catch((e) => {
      console.error("billing gate: subscription read failed, serving", e);
      return null;
    });
    if (billing) {
      const usage = await withTenant(chatToken.propertyId, (tx) =>
        tx.conversation.count({
          where: { propertyId: chatToken.propertyId, createdAt: { gte: monthStartUtc(now) } },
        })
      ).catch((e) => {
        console.error("billing gate: usage count failed, serving", e);
        return 0;
      });
      const verdict = gateDecision(
        {
          tier: billing.tier,
          status: billing.status,
          trialEndsAt: billing.trialEndsAt,
          currentPeriodEnd: billing.currentPeriodEnd,
          cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
          overageAgreed: billing.overageAgreed,
        },
        usage,
        now
      );
      if (!verdict.allowed) {
        // Contact is read only on the pause path (saves a query on
        // every served turn); a failed read degrades to the generic
        // message rather than failing the pause.
        const profile = await withTenant(chatToken.propertyId, (tx) =>
          tx.propertyProfile.findUnique({
            where: { propertyId: chatToken.propertyId },
            select: { phone: true, email: true },
          })
        ).catch(() => null);
        const encoder = new TextEncoder();
        const reply = pauseMessage(verdict.reason, profile);
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done", reply, cards: [], conversationId: null, replyRole: "assistant" })}\n\n`)
            );
            controller.close();
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
    }
  }
  if (chatToken.scope === "widget") {
    if (!chatToken.domain || !(await isDomainApproved(chatToken.propertyId, chatToken.domain))) {
      return NextResponse.json(
        { error: "This site is no longer approved to host this chat." },
        { status: 403 }
      );
    }
  }
  // Throttles (counted before any row is written, so a throttled
  // turn costs bucket writes and no model call). Two dimensions: per
  // tenant (noisy neighbours) and per IP (one bot can't spend a whole
  // property's budget). 429 + Retry-After; wording stays generic.
  {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const [tenant, byIp] = await Promise.all([
      checkChatRate(chatToken.propertyId),
      checkChatRateByIp(ip),
    ]);
    const decision = !tenant.allowed ? tenant : byIp;
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "Too many messages right now. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } }
      );
    }
  }

  const incomingId = typeof body?.conversationId === "string" ? body.conversationId : "";
  // Tenant path: every query below runs with the verified token's
  // property. Each block is its own short transaction — never held
  // across the model/streaming calls further down (pool rule).
  const tenant = chatToken.propertyId;
  let conversation = incomingId
    ? await withTenant(tenant, (tx) => tx.conversation.findUnique({ where: { id: incomingId } }))
    : null;
  // A conversation id from another property is ignored, never reused:
  // it would otherwise let one site's token read another's thread.
  // (RLS confines the lookup too — belt and braces with this check.)
  if (conversation && conversation.propertyId !== chatToken.propertyId) {
    conversation = null;
  }
  if (!conversation) {
    conversation = await withTenant(tenant, (tx) =>
      tx.conversation.create({
        data: {
          propertyId: chatToken.propertyId,
          language: "en",
        },
      })
    );
  }

  // Language follows the guest's latest real language, both ways: a
  // Bengali-letter message switches to Bengali, an English-letter
  // message switches back. Neutral messages (dates, prices, "৳15,000"
  // alone) return null and leave the language unchanged, so a
  // conversation can never get stuck by a currency sign again.
  const detected = detectLanguage(message);
  if (detected && detected !== conversation.language) {
    const conversationId = conversation.id;
    conversation = await withTenant(tenant, (tx) =>
      tx.conversation.update({
        where: { id: conversationId },
        data: { language: detected },
      })
    );
  }
  // Const capture for the stream closure: a `let` narrowed above would
  // lose its narrowing inside the closure.
  const activeConversation = conversation;

  await withTenant(tenant, (tx) =>
    tx.message.create({
      data: { conversationId: activeConversation.id, role: "user", content: message },
    })
  );

  // Streaming (UX): the turn runs inside the stream's start(), so phase
  // events reach the browser WHILE the model and the resort checks are
  // still running — the whole point. Auth, conversation setup, and the
  // user message above stay outside the stream, so they still return
  // proper JSON errors. Events: { type: "phase", phase, detail? },
  // { type: "done", reply, conversationId, cards, replyRole,
  //   systemNotice? }, { type: "error", error }. replyRole tells the
  // widget how to render (assistant bubble vs system line vs nothing
  // when empty); systemNotice carries the handoff-turn contact ask.
  // The assistant message is saved BEFORE the done event, exactly as
  // the old JSON contract did.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        // Staff-mode gate (§1/§4): a conversation with an active handoff
        // belongs to the team — no agent, no adapter, no tools. Billing
        // already ran above and keeps precedence. On infrastructure
        // failure the gate fails open (like every chat-path guard) and
        // the BOT path below either serves or errors honestly.
        const staffTurn = await withTenant(tenant, (tx) =>
          runStaffModeTurn(tx, {
            conversationId: activeConversation.id,
            guestMessage: message,
            lang: activeConversation.language === "bn" ? "bn" : "en",
          })
        ).catch((e) => {
          console.error("Staff gate failed, continuing to BOT path:", e instanceof Error ? e.message : e);
          return null;
        });
        if (staffTurn) {
          send({
            type: "done",
            reply: staffTurn.reply,
            conversationId: activeConversation.id,
            cards: [],
            replyRole: staffTurn.replyRole,
          });
          return;
        }
        // History window = the LAST 20 messages: newest-first fetch,
        // reversed back to chronological order for the model. (An
        // earlier cut used oldest-first + take, which silently dropped
        // the newest context past 20 messages — fixed 2026-10-29.)
        const history = (
          await withTenant(tenant, (tx) =>
            tx.message.findMany({
              where: { conversationId: activeConversation.id },
              orderBy: { createdAt: "desc" },
              take: 20,
            })
          )
        ).reverse();

        // Set when THIS turn actually inserts a handoff row (deduped
        // re-requests don't count): drives the Amendment A1 notice.
        let turnCreatedHandoff = false;
        const db: ToolDb = {
          hasQuote: async (cid, roomSlug, checkIn, checkOut) => {
            const logs = await withTenant(tenant, (tx) =>
              tx.toolCallLog.findMany({
                where: { conversationId: cid, toolName: "get_quote" },
              })
            );
            return logs.some((l) => {
              const input = l.input as { roomSlug?: string; checkIn?: string; checkOut?: string } | null;
              return (
                input?.roomSlug === roomSlug && input?.checkIn === checkIn && input?.checkOut === checkOut
              );
            });
          },
          hasDraft: async (cid) => {
            const logs = await withTenant(tenant, (tx) =>
              tx.toolCallLog.findMany({
                where: { conversationId: cid, toolName: "create_booking_draft" },
              })
            );
            return logs.some((l) => {
              const output = l.output as { bookingCode?: string } | null;
              return Boolean(output?.bookingCode);
            });
          },
          // Claim-then-book: INSERT-or-denied serializes overlapping
          // turns at the database (P2002 = sibling holds the window).
          // Only P2002 denies — any other error rethrows so a sick
          // database fails the turn honestly instead of double-booking.
          // On denial, one prune-and-retry heals a crash-orphaned
          // claim (older than 5 min) without wasting the guest's turn.
          claimDraft: async (cid) => {
            const attempt = async (): Promise<boolean> => {
              try {
                await withTenant(tenant, (tx) =>
                  tx.draftClaim.create({ data: { conversationId: cid } })
                );
                return true;
              } catch (e) {
                if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
                  return false;
                }
                throw e;
              }
            };
            if (await attempt()) return true;
            await withTenant(tenant, (tx) =>
              tx.draftClaim.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 5 * 60_000) } } })
            ).catch(() => null);
            return attempt();
          },
          releaseDraftClaim: async (cid) => {
            await withTenant(tenant, (tx) =>
              tx.draftClaim.deleteMany({ where: { conversationId: cid } })
            ).catch(() => null);
          },
          getDraft: async (cid) => {
            const logs = await withTenant(tenant, (tx) =>
              tx.toolCallLog.findMany({
                where: { conversationId: cid, toolName: "create_booking_draft" },
                orderBy: { createdAt: "desc" },
              })
            );
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
            const result = await withTenant(tenant, (tx) =>
              ensureConversationHandoff(tx, { conversationId: cid, reason, summary })
            );
            if (result.created) turnCreatedHandoff = true;
          },
          // Resort payment pointer: the booking code comes from this
          // conversation's draft log (server-side, never the model), the
          // page URL from the property's binding (owner-configured). No
          // code + no page = honest error, never an invented link.
          getResortPaymentLink: async (cid) => {
            const binding = await withTenant(tenant, (tx) =>
              tx.propertyBinding.findUnique({
                where: { propertyId: activeConversation.propertyId },
                select: { paymentPageUrl: true },
              })
            );
            if (!binding?.paymentPageUrl) {
              throw new Error("This resort hasn't set up its payment page yet.");
            }
            const logs = await withTenant(tenant, (tx) =>
              tx.toolCallLog.findMany({
                where: { conversationId: cid, toolName: "create_booking_draft" },
                orderBy: { createdAt: "desc" },
              })
            );
            for (const l of logs) {
              const output = l.output as { bookingCode?: string } | null;
              if (output?.bookingCode) {
                return {
                  paymentUrl: resortPaymentUrl(binding.paymentPageUrl, output.bookingCode),
                  bookingCode: output.bookingCode,
                };
              }
            }
            throw new Error("No booking draft is held in this conversation yet.");
          },
        };

        // Per-property backend + catalogue (adapter Phases 2-3): the
        // token's property selects its Suite binding and its room list.
        // Resolution failure DEGRADES the turn, never ends it — a dead
        // guest chat is always worse than a degraded one. No suite →
        // handoff-only tools; suite without catalogue → suite tools
        // stay, catalogue tools go. The model is told (BOOKING OFFLINE
        // prompt block), and the failure is recorded for the owner
        // (Settings → Booking system → Recent backend failures) — the
        // guest just gets honest answers, never an error banner.
        const mode = await resolveBookingMode(activeConversation.propertyId, {
          resolveSuite: adapterForProperty,
          resolveCatalogue: catalogueForProperty,
        });
        const suite = mode.suite;
        const catalogue = mode.catalogue;
        const degraded = mode.degradedReason !== null;
        if (mode.degradedReason) {
          const reason = mode.degradedReason;
          await withTenant(tenant, (tx) =>
            tx.toolCallLog.create({ data: resolutionFailureRow(activeConversation.id, reason) })
          ).catch((e) => {
            console.error(
              "concierge: degraded-row write failed",
              e instanceof Error ? e.message : e
            );
          });
        }
        // Resort-pay pointer for THIS turn: on when the property
        // configured its own payment page AND runs a real Suite backend.
        // One cheap row read; the executor re-checks per call anyway.
        const bindingPay = await withTenant(tenant, (tx) =>
          tx.propertyBinding
            .findUnique({
              where: { propertyId: activeConversation.propertyId },
              select: { paymentPageUrl: true },
            })
        ).catch(() => null);
        const resortPayOn = mode.hasSuite && bindingPay?.paymentPageUrl != null;
        const baseExecute = createToolExecutor(activeConversation.id, db, suite, catalogue, {
          resortPay: resortPayOn,
          hasSuite: mode.hasSuite,
          hasCatalogue: mode.hasCatalogue,
        });
        // Reply identity (onboarding Phase 3): absent profile = default voice.
        const profile = await withTenant(tenant, (tx) =>
          tx.propertyProfile.findUnique({ where: { propertyId: activeConversation.propertyId } })
        ).catch(() => null);
        // Resolution evidence (multi-tenant core): one log line per turn —
        // which property resolved to which backend, how many rooms, and
        // whether the voice is custom. The P4 isolation proof reads these.
        console.log(
          `concierge: property=${activeConversation.propertyId} adapter=${suite === null ? "none" : "http"} rooms=${catalogue.length} persona=${profile ? "custom" : "default"} degraded=${degraded ? "yes" : "no"}`
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
          await withTenant(tenant, (tx) =>
            tx.toolCallLog.create({
              data: {
                conversationId: activeConversation.id,
                toolName: name,
                input: input as never,
                output: result as never,
              },
            })
          );
          return result;
        };

        // Step 2b: cards are built from this turn's tool logs only, so the
        // UI can never show a quote or draft from an earlier conversation.
        const turnStart = new Date();

        // Step 3 (RAG — supporting only, never the headline): retrieve
        // seeded property knowledge for this turn's question. Retrieval
        // failure is NOT fatal: the agent then runs without grounding and
        // must say it does not know property facts instead of inventing.
        // Trivial turns (greetings etc.) skip retrieval entirely — no
        // embedding call, no phase event (see needsRetrieval).
        let grounding: string | null = null;
        if (needsRetrieval(message)) {
          try {
            send({ type: "phase", phase: "checking", detail: "Looking up what I know about the resort…" });
            const retrieved = await retrieveGrounding({
              query: message,
              embed: embedText,
              search: async (embedding) => {
                const rows = await withTenant(tenant, (tx) =>
                  tx.$queryRaw<
                    Array<{ title: string; content: string; similarity: number }>
                  >`SELECT d."title", c."content", 1 - (c."embedding" <=> ${toVectorLiteral(embedding)}::vector) AS "similarity" FROM "KnowledgeChunk" AS c JOIN "KnowledgeDocument" AS d ON d."id" = c."documentId" WHERE d."propertyId" = ${activeConversation.propertyId} AND c."indexed" = true ORDER BY c."embedding" <=> ${toVectorLiteral(embedding)}::vector ASC LIMIT 4`
                );
                return rows;
              },
            });
            grounding = retrieved.text;
            // Always logged on attempt (chunks may be empty): the
            // dashboard splits grounded vs silent turns from these
            // rows, and silent retrieval is a signal, not an absence.
            await withTenant(tenant, (tx) =>
              tx.toolCallLog.create({
                data: {
                  conversationId: activeConversation.id,
                  toolName: "rag_retrieval",
                  input: { query: message } as never,
                  output: { chunks: retrieved.chunks } as never,
                },
              })
            );
          } catch (e) {
            console.error(
              "RAG retrieval failed, continuing without grounding:",
              e instanceof Error ? e.message : e
            );
          }
        }

        // POST-HACKATHON TODO (cost controls, docs/cost-controls-plan.md):
        // refuse here when this property is killed or over its token
        // budget. Not enforced today — every turn runs.
        const { reply } = await runAgent({
          messages: [
            {
              role: "system",
              content: systemPrompt(
                activeConversation.language === "bn" ? "bn" : "en",
                grounding,
                catalogue,
                profile,
                resortPayOn
                  ? { resortPay: true as const, degraded }
                  : { resortPay: false as const, degraded }
              ),
            },
            // Token budget: 20 messages kept, each capped (lib/history)
            // so old pastes can't tax every later turn.
            ...capHistoryForModel(history),
          ],
          tools: toolDefinitionsFor(catalogue, {
            resortPay: resortPayOn,
            hasSuite: mode.hasSuite,
            hasCatalogue: mode.hasCatalogue,
          }),
          execute,
          onModelCall: async (usage) => {
            await withTenant(tenant, (tx) =>
              tx.toolCallLog.create({
                data: {
                  conversationId: activeConversation.id,
                  toolName: "model_call",
                  output: { via: usage.via } as never,
                  promptTokens: usage.promptTokens,
                  completionTokens: usage.completionTokens,
                  reasoningTokens: usage.reasoningTokens,
                },
              })
            );
          },
          onModelStart: async () => {
            send({ type: "phase", phase: "thinking" });
          },
        });

        await withTenant(tenant, (tx) =>
          tx.message.create({
            data: { conversationId: activeConversation.id, role: "assistant", content: reply },
          })
        );
        await withTenant(tenant, (tx) =>
          tx.conversation.update({
            where: { id: activeConversation.id },
            data: { updatedAt: new Date() },
          })
        );
        // Amendment A1: the turn that created a handoff ends with the
        // contact ask (persisted right after the reply, like every
        // system line). The resort phone is read only on this path.
        let systemNotice: {
          id: string;
          role: "system";
          author: null;
          content: string;
          createdAt: string;
        } | null = null;
        if (turnCreatedHandoff) {
          const profile = await withTenant(tenant, (tx) =>
            tx.propertyProfile.findUnique({
              where: { propertyId: tenant },
              select: { phone: true },
            })
          ).catch(() => null);
          const trimmedPhone = profile?.phone?.trim() ?? "";
          const phone = trimmedPhone ? trimmedPhone : null;
          const row = await withTenant(tenant, (tx) =>
            appendHandoffNotice(tx, {
              conversationId: activeConversation.id,
              lang: activeConversation.language === "bn" ? "bn" : "en",
              resortPhone: phone,
            })
          );
          systemNotice = {
            id: row.id,
            role: "system",
            author: null,
            content: row.content,
            createdAt: row.createdAt.toISOString(),
          };
        }
        const turnLogs = await withTenant(tenant, (tx) =>
          tx.toolCallLog.findMany({
            where: { conversationId: activeConversation.id, createdAt: { gte: turnStart } },
            orderBy: { createdAt: "asc" },
          })
        );
        const cards = buildCards(
          turnLogs.map((l) => ({ toolName: l.toolName, input: l.input, output: l.output }))
        );
        send({
          type: "done",
          reply,
          conversationId: activeConversation.id,
          cards,
          replyRole: "assistant",
          ...(systemNotice ? { systemNotice } : {}),
        });
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
