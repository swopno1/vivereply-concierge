// Lane A runtime (Handover R1): ViveReply-knowledge answers for the
// owner Assistant from any property scope. Routing is by question:
// account-state intents and platform-corpus retrieval hits answer here;
// everything else falls through to Lane B (the existing property path,
// untouched). Lanes never blend: Lane A sees account state + platform
// chunks only, never property data.

import { prismaService } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";
import { embedText } from "@/lib/embeddings";
import { RAG_TOP_K, retrieveGrounding, toVectorLiteral } from "@/lib/rag";
import { chatCompletion } from "@/lib/meta";
import { getBillingSnapshot } from "@/lib/billing";
import { citationFor } from "@/lib/assistant-ingest";

export type AccountIntent = "usage" | "plan" | "pause" | null;

// Tight on purpose: these must fire only for account questions, never for
// property questions (rooms, prices, bookings). English + Bengali.
const USAGE_WORDS = /conversations?\s+(left|remaining|used|this month)|quota|কথোপকথন|কোটা|বাকি|ব্যবহার/i;
const USAGE_LEFT_PHRASE = /how many.*(left|remaining)|ক[তো]টি.*(বাকি|আছে)/i;
const PLAN_WORDS = /\b(what plan|which plan|my plan|my trial|trial end|trial left|when does .* (trial|subscription)|plan am i on)\b|প্ল্যান|ট্রায়াল|মেয়াদ/i;
const PAUSE_WORDS = /\b(why.*(paused|pause|stopped|offline)|chat.*(paused|not working|stopped)|unpause|resume)\b|বন্ধ|থেমে|চালু হচ্ছে না/i;

/** Account-state intent from the question text alone (no DB, unit-tested). */
export function detectAccountIntent(message: string): AccountIntent {
  if (PAUSE_WORDS.test(message)) return "pause";
  if (USAGE_WORDS.test(message) || USAGE_LEFT_PHRASE.test(message)) return "usage";
  if (PLAN_WORDS.test(message)) return "plan";
  return null;
}

/**
 * ViveReply-ness (English + Bengali): does this question ask about
 * ViveReply itself rather than the resort property? Gates the honest
 * unknown + miss logging when retrieval also misses. Deliberately strict
 * on ambiguous words: capital-S "Suite" is the product, lowercase
 * "suites" is a room type (Lane B); bare "support"/"price" stay Lane B.
 */
const VIVEREPLY_STRONG =
  /vivereply|concierge|roomready|chatbot|widget|trial|subscription|quota|billing|invoice|whatsapp|pms|dashboard|ট্রায়াল|প্ল্যান|কোটা|সাবস্ক্রিপশন|হোয়াটসঅ্যাপ/i;
const SUITE_CAPITALIZED = /\bSuite\b/;
const SUITE_COMPANIONS = /suite\s+(pms|system|app|dashboard|admin)/i;
const SUPPORT_HUMAN = /customer support|contact support|talk to (a |the )?(human|someone|support)|human agent/i;

export function isViveReplyQuestion(message: string): boolean {
  return (
    VIVEREPLY_STRONG.test(message) ||
    SUITE_CAPITALIZED.test(message) ||
    SUITE_COMPANIONS.test(message) ||
    SUPPORT_HUMAN.test(message)
  );
}

export type Lane = "lane-a-live" | "lane-a-corpus" | "lane-b";

/**
 * Lane routing, pure and total: account intents always answer live;
 * otherwise a platform-corpus hit answers from retrieval; otherwise the
 * turn falls through to Lane B (existing property path).
 */
export function routeLane(args: { accountIntent: AccountIntent; corpusHit: boolean }): Lane {
  if (args.accountIntent) return "lane-a-live";
  if (args.corpusHit) return "lane-a-corpus";
  return "lane-b";
}

export type PlatformChunk = { title: string; source: string; content: string; similarity: number };

// SERVICE PATH (marked): platform rows (NULL propertyId) are invisible to
// the tenant role by RLS design, so Lane A retrieval bypasses with an
// explicit platform-only filter. Tenants can read platform knowledge;
// only the super-admin ingestion writes it.
export async function retrievePlatformGrounding(query: string): Promise<{ text: string | null; chunks: PlatformChunk[] }> {
  const retrieved = await retrieveGrounding({
    query,
    embed: embedText,
    search: async (embedding) => {
      const db = prismaService();
      return db.$queryRaw<Array<{ title: string; source: string; content: string; similarity: number }>>`
        SELECT d."title", d."source", c."content", 1 - (c."embedding" <=> ${toVectorLiteral(embedding)}::vector) AS "similarity"
        FROM "KnowledgeChunk" AS c JOIN "KnowledgeDocument" AS d ON d."id" = c."documentId"
        WHERE d."propertyId" IS NULL AND c."indexed" = true
        ORDER BY c."embedding" <=> ${toVectorLiteral(embedding)}::vector ASC
        LIMIT ${RAG_TOP_K}`;
    },
  });
  return { text: retrieved.text, chunks: retrieved.chunks as PlatformChunk[] };
}

export type AccountState = {
  usageLine: string;
  planLine: string;
  pauseLine: string;
};

/** Live account state for one property — the same reads the Usage page renders. */
export async function accountStateFor(propertyId: string): Promise<AccountState | null> {
  const snapshot = await getBillingSnapshot(propertyId, new Date()).catch(() => null);
  if (!snapshot) return null;
  const planName = snapshot.manualActive && snapshot.manualPlan ? snapshot.manualPlan : snapshot.tier;
  const usageLine = `Conversations this month: ${snapshot.usageThisMonth.toLocaleString()} used of ${snapshot.quotaThisMonth.toLocaleString()} (plan ${planName}).`;
  const planLine = snapshot.manualActive
    ? `Manual billing: ${planName} plan, paid through ${snapshot.manualPeriodEnd?.toISOString().slice(0, 10) ?? "unknown"} (renewals arranged with ViveReply directly).`
    : !snapshot.hasSubscription
      ? "No subscription on file: full access."
      : snapshot.status === "TRIAL"
        ? `Trial plan; ${snapshot.trialDaysLeft} day(s) left${snapshot.trialEndsAt ? `, ends ${snapshot.trialEndsAt.toISOString().slice(0, 10)}` : ""}.`
        : `${snapshot.tier} plan, ${snapshot.interval}; ${snapshot.status === "PAST_DUE" ? "latest payment failed (Stripe is retrying; chat keeps running)" : `renews ${snapshot.currentPeriodEnd?.toISOString().slice(0, 10) ?? "at period end"}`}.`;
  const pauseLine = snapshot.gate.allowed
    ? "Guest chat is currently running."
    : snapshot.gate.reason === "admin-hold"
      ? "Guest chat is paused by ViveReply. Fix: contact support."
      : snapshot.gate.reason === "trial-expired"
        ? "Guest chat is paused: trial-expired. Fix: subscribe on Orders & Billing."
        : snapshot.gate.reason === "quota-exceeded"
          ? "Guest chat is paused: quota-exceeded. Fix: wait for next month or upgrade."
          : "Guest chat is paused: subscription-ended. Fix: resubscribe on Orders & Billing.";
  return { usageLine, planLine, pauseLine };
}

const LANE_A_RULES = [
  "Answer ONLY from the SOURCES and ACCOUNT STATE below. Never use property data (rooms, prices, bookings) — you do not have any. Never invent ViveReply facts.",
  "Suite pricing: no figures exist — never state any; deflect to WhatsApp +8801819062270 or the Support page.",
  "Chatbot plans: state only THIS account's plan name, quota, and dates from ACCOUNT STATE. Never quote other tiers' prices — point to Orders & Billing.",
  "Guest money never touches ViveReply Stripe — never discuss guest payment collection as a ViveReply service.",
  "Reply in the same language as the user's question (English or Bengali).",
  "End with a Sources line listing the given citations exactly as written.",
].join("\n- ");

function laneASystemPrompt(lang: "en" | "bn", grounding: string, account: string, citations: string): string {
  return [
    "You are the ViveReply owner assistant answering a question about ViveReply itself (not about any resort property).",
    `Language: reply in ${lang === "bn" ? "Bengali" : "English"}.`,
    "",
    "RULES:",
    `- ${LANE_A_RULES}`,
    "",
    "ACCOUNT STATE (live, this account only):",
    account || "(none relevant)",
    "",
    "SOURCES (retrieved platform knowledge):",
    grounding || "(no retrieved chunks — rely on ACCOUNT STATE and say what you cannot source)",
    "",
    "CITATIONS (append verbatim as the final 'Sources:' line):",
    citations,
  ].join("\n");
}

export const HONEST_UNKNOWN = {
  en: "I don't have verified details on that right now. Try the Support page for guides, or message us on WhatsApp at +8801819062270 and a human will help.",
  bn: "এ বিষয়ে আমার কাছে যাচাইকৃত তথ্য নেই। গাইডের জন্য Support পেজ দেখুন, অথবা WhatsApp-এ +8801819062270 নম্বরে লিখুন — একজন মানুষ সাহায্য করবেন.",
} as const;

/** Records a Lane A miss for the super-admin unanswered list (service path). */
export async function logAssistantMiss(args: { question: string; lang: string; propertyId: string | null }): Promise<void> {
  const db = prismaService();
  await db.assistantUnanswered
    .create({ data: { question: args.question.slice(0, 2000), lang: args.lang, propertyId: args.propertyId } })
    .catch((e) => console.error("Assistant miss log failed:", e instanceof Error ? e.message : e));
}

/**
 * One Lane A attempt for a direct-scope turn. Returns handled:false when
 * the question belongs to Lane B (existing property path runs instead).
 * Retrieval failure also falls through (existing behavior preserved);
 * model failure throws so the route fails the turn honestly.
 */
export async function runLaneATurn(args: {
  message: string;
  lang: "en" | "bn";
  propertyId: string;
  conversationId: string;
  send: (event: unknown) => void;
}): Promise<{ handled: boolean }> {
  const accountIntent = detectAccountIntent(args.message);
  let grounding: string | null = null;
  let chunks: PlatformChunk[] = [];
  try {
    args.send({ type: "phase", phase: "checking", detail: "Looking up ViveReply answers…" });
    const retrieved = await retrievePlatformGrounding(args.message);
    grounding = retrieved.text;
    chunks = retrieved.chunks;
  } catch (e) {
    console.error("Lane A retrieval failed, falling through to Lane B:", e instanceof Error ? e.message : e);
    return { handled: false };
  }

  const finish = async (reply: string) => {
    await withTenant(args.propertyId, (tx) =>
      tx.message.create({ data: { conversationId: args.conversationId, role: "assistant", content: reply } })
    );
    args.send({ type: "done", reply, conversationId: args.conversationId, cards: [], replyRole: "assistant" });
  };

  if (routeLane({ accountIntent, corpusHit: !!grounding }) === "lane-b") {
    if (!isViveReplyQuestion(args.message)) return { handled: false };
    await logAssistantMiss({ question: args.message, lang: args.lang, propertyId: args.propertyId });
    await finish(HONEST_UNKNOWN[args.lang]);
    return { handled: true };
  }

  const outcome = await answerLaneA({
    message: args.message,
    lang: args.lang,
    propertyId: args.propertyId,
    accountIntent,
    corpusHit: true,
    grounding,
    chunks,
  });
  if (!outcome.handled) return { handled: false };
  await finish(outcome.reply);
  return { handled: true };
}

export type LaneAOutcome =
  | { handled: true; reply: string; path: "live" | "corpus" | "unknown" }
  | { handled: false };

/**
 * One Lane A turn: live account answers, corpus answers with citations, or
 * honest unknown (logged). Returns handled:false when the question belongs
 * to Lane B. Throws on model failure so the caller fails the turn honestly.
 */
export async function answerLaneA(args: {
  message: string;
  lang: "en" | "bn";
  propertyId: string;
  accountIntent: Exclude<AccountIntent, null> | null;
  corpusHit: boolean;
  grounding: string | null;
  chunks: PlatformChunk[];
}): Promise<LaneAOutcome> {
  const lane = routeLane({ accountIntent: args.accountIntent, corpusHit: args.corpusHit });
  if (lane === "lane-b") return { handled: false };

  if (lane === "lane-a-live") {
    const state = await accountStateFor(args.propertyId);
    if (!state) return { handled: true, reply: HONEST_UNKNOWN[args.lang], path: "unknown" };
    const account =
      args.accountIntent === "usage" ? state.usageLine : args.accountIntent === "plan" ? state.planLine : state.pauseLine;
    const { reply } = await chatCompletion([
      { role: "system", content: laneASystemPrompt(args.lang, "", account, "") },
      { role: "user", content: args.message },
    ]);
    return { handled: true, reply, path: "live" };
  }

  // lane-a-corpus
  const citations = args.chunks.map((c) => citationFor(c.source, c.title)).join("; ");
  const { reply } = await chatCompletion([
    { role: "system", content: laneASystemPrompt(args.lang, args.grounding ?? "", "", citations) },
    { role: "user", content: args.message },
  ]);
  return { handled: true, reply, path: "corpus" };
}
