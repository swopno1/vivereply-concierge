// Eval dashboard: weekly aggregates from the logs we already keep.
// Tokens/turn, calls/turn, fallback rate, tool mix, RAG hit rate —
// the "Observe" half of the optimization loop. No cost math: there are
// no verified per-token prices for Muse Spark, and an invented price
// would be worse than no number.
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

    const [userMessages, logs] = await Promise.all([
      prisma.message.findMany({
        where: { role: "user", createdAt: { gte: since } },
        select: { conversationId: true },
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
    ]);

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
    const ragRows = toolMix.get("rag_retrieval") ?? 0;
    console.log(`rag retrieval logged on ${ragRows}/${turns} turn(s)`);

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
