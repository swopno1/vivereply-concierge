// Eval dashboard: weekly aggregates from the logs we already keep.
// Tokens/turn, calls/turn, fallback rate, turn latency p50/p95, tool
// mix + error share, grounded-vs-silent split, helpful votes — the
// "Observe" half of the optimization loop. Cost math runs ONLY on
// founder-pasted prices (COST_USD_PER_1M_PROMPT / _COMPLETION env):
// there are no verified list prices for Muse Spark, so the dashboard
// refuses to invent any — unset prices print the stance, not $0.
//
//   pnpm eval:dashboard            # last 7 days
//   pnpm eval:dashboard -- --days=30
//
// Needs DATABASE_URL (or DIRECT_URL). Run from a machine that reaches
// the database (NOT this sandbox: raw TCP to Supabase is blocked here).

import { fileURLToPath } from "node:url";

const daysArg = process.argv.slice(2).find((a) => a.startsWith("--days="));
const DAYS = Math.max(1, Number.parseInt(daysArg?.split("=")[1] ?? "7", 10) || 7);

async function main() {
  try {
    const dotenv = await import("dotenv").catch(() => null);
    dotenv?.config?.({ path: ".env.local" });
    dotenv?.config?.();
  } catch { /* env-only is fine */ }

  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("Refusing: set DATABASE_URL (or DIRECT_URL) in the environment.");
    process.exit(1);
  }
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

  try {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
    console.log(`dashboard: last ${DAYS} day(s), since ${since.toISOString()}`);

    const [messages, logs, votes] = await Promise.all([
      prisma.message.findMany({
        where: { createdAt: { gte: since } },
        select: { role: true, conversationId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.toolCallLog.findMany({
        where: { createdAt: { gte: since } },
        select: {
          toolName: true,
          output: true,
          promptTokens: true,
          completionTokens: true,
          reasoningTokens: true,
          conversationId: true,
          conversation: { select: { propertyId: true } },
        },
      }),
      prisma.chatRating.groupBy({
        by: ["helpful"],
        where: { updatedAt: { gte: since } },
        _count: { helpful: true },
      }).catch(() => []),
    ]);
    const userMessages = messages.filter((m) => m.role === "user");

    const turns = userMessages.length;
    const convs = new Set(userMessages.map((m) => m.conversationId)).size;
    const modelCalls = logs.filter((l) => l.toolName === "model_call");
    const sum = (rows, f) => rows.reduce((n, r) => n + (r[f] ?? 0), 0);
    const prompt = sum(modelCalls, "promptTokens");
    const completion = sum(modelCalls, "completionTokens");
    const reasoning = sum(modelCalls, "reasoningTokens");
    const baseten = modelCalls.filter((l) => (l.output ?? {}).via === "baseten").length;

    console.log(`turns: ${turns} across ${convs} conversation(s)`);
    console.log(`model calls: ${modelCalls.length} (${turns ? (modelCalls.length / turns).toFixed(2) : "-"} per turn)`);
    console.log(`tokens: prompt ${prompt.toLocaleString()} / completion ${completion.toLocaleString()} / reasoning ${reasoning.toLocaleString()}`);
    console.log(`tokens/turn: ${turns ? Math.round((prompt + completion) / turns).toLocaleString() : "-"}`);
    console.log(
      `fallback (baseten) serves: ${baseten}/${modelCalls.length}` +
        (modelCalls.length ? ` (${((100 * baseten) / modelCalls.length).toFixed(1)}%)` : "")
    );

    // Cost: founder-pasted $/1M tokens only (see header). Reasoning
    // tokens price as completion (the usual convention; stated so a
    // different convention can correct the line, not the data).
    const pricePrompt = Number(process.env.COST_USD_PER_1M_PROMPT ?? "");
    const priceCompletion = Number(process.env.COST_USD_PER_1M_COMPLETION ?? "");
    if (Number.isFinite(pricePrompt) && Number.isFinite(priceCompletion) && pricePrompt > 0 && priceCompletion > 0) {
      const usd = (prompt * pricePrompt + (completion + reasoning) * priceCompletion) / 1_000_000;
      console.log(`est. cost: $${usd.toFixed(2)} @ $${pricePrompt}/$${priceCompletion} per 1M prompt/completion`);
    } else {
      console.log("est. cost: n/a — set COST_USD_PER_1M_PROMPT + COST_USD_PER_1M_COMPLETION to price this window");
    }

    // Per-property split (spend follows design: which tenant burns).
    const byProp = new Map();
    for (const l of modelCalls) {
      const p = l.conversation?.propertyId ?? "(deleted)";
      const e = byProp.get(p) ?? { calls: 0, prompt: 0, completion: 0, reasoning: 0 };
      e.calls += 1;
      e.prompt += l.promptTokens ?? 0;
      e.completion += l.completionTokens ?? 0;
      e.reasoning += l.reasoningTokens ?? 0;
      byProp.set(p, e);
    }
    console.log("per-property model calls:");
    for (const [p, e] of [...byProp.entries()].sort((a, b) => b[1].calls - a[1].calls)) {
      console.log(
        `  ${p}: ${e.calls} calls, ${(e.prompt + e.completion).toLocaleString()} tk (r:${e.reasoning.toLocaleString()})`
      );
    }

    // Tool mix: what the agent actually does.
    const toolMix = new Map();
    for (const l of logs) {
      if (l.toolName === "model_call") continue;
      toolMix.set(l.toolName, (toolMix.get(l.toolName) ?? 0) + 1);
    }
    console.log("tool mix:");
    for (const [t, n] of [...toolMix.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${t}: ${n}`);
    }
    // Tool error share: outputs carrying { error } over all tool calls
    // (model_call rows excluded — they never error by construction).
    // A rising share means the agent is fighting the Suite, not serving.
    const toolRows = logs.filter((l) => l.toolName !== "model_call" && l.toolName !== "rag_retrieval");
    const toolErrs = toolRows.filter((l) => typeof (l.output ?? {}).error === "string").length;
    console.log(
      `tool errors: ${toolErrs}/${toolRows.length}` +
        (toolRows.length ? ` (${((100 * toolErrs) / toolRows.length).toFixed(1)}%)` : "")
    );
    const ragAttempts = logs.filter((l) => l.toolName === "rag_retrieval");
    const ragGrounded = ragAttempts.filter((l) => ((l.output ?? {}).chunks ?? []).length > 0).length;
    console.log(
      `rag: attempted ${ragAttempts.length}/${turns} turn(s), grounded ${ragGrounded}, silent ${ragAttempts.length - ragGrounded}`
    );

    // Turn latency: each user message paired with the NEXT assistant
    // message in the same conversation (unpaired trailing users are
    // dropped, not zeroed). Measures user-message to saved-reply —
    // model + tools + stream, end to end.
    const latMs = [];
    const byConvMsgs = new Map();
    for (const m of messages) {
      if (!byConvMsgs.has(m.conversationId)) byConvMsgs.set(m.conversationId, []);
      byConvMsgs.get(m.conversationId).push(m);
    }
    for (const rows of byConvMsgs.values()) {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].role !== "user") continue;
        const next = rows.slice(i + 1).find((r) => r.role === "assistant");
        if (next) latMs.push(next.createdAt.getTime() - rows[i].createdAt.getTime());
      }
    }
    latMs.sort((a, b) => a - b);
    const pct = (p) => (latMs.length ? Math.round(latMs[Math.min(latMs.length - 1, Math.floor((p / 100) * latMs.length))] / 100) / 10 : "-");
    console.log(`turn latency (user msg → saved reply): n=${latMs.length}, p50=${pct(50)}s, p95=${pct(95)}s`);

    // Helpful votes: one row per conversation, freely changeable —
    // counts are current ballots, not vote events.
    const yes = votes.find((v) => v.helpful)?._count.helpful ?? 0;
    const no = votes.find((v) => !v.helpful)?._count.helpful ?? 0;
    console.log(`helpful votes: ${yes} yes / ${no} no${yes + no ? ` (${((100 * yes) / (yes + no)).toFixed(0)}% yes)` : ""}`);

    // Heaviest conversations by completion tokens (where to look first).
    const byConv = new Map();
    for (const l of modelCalls) {
      byConv.set(l.conversationId, (byConv.get(l.conversationId) ?? 0) + (l.completionTokens ?? 0));
    }
    console.log("top conversations by completion tokens:");
    for (const [c, n] of [...byConv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`  ${c}: ${n.toLocaleString()}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`dashboard: FAILED: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
