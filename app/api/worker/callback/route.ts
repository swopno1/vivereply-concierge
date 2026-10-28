// Ingestion worker callback (RAG onboarding rework). The worker owns fetch,
// parse, chunk, embed, and store; this endpoint owns run state and budget
// authority. The worker reports; the app decides.
//   POST /api/worker/callback  Authorization: Bearer <WORKER_SHARED_SECRET>
//   { runId, type: "progress", stats }
//   { runId, type: "complete", stats }
//   { runId, type: "failed", error }
// Every reply is { stop: boolean } — true halts the worker (used when the
// token ceiling trips or the run already ended).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWorkerSecret } from "@/lib/worker";
import { overBudget, type RunStats } from "@/lib/onboarding";

function mergeStats(old: unknown, update: unknown): RunStats {
  const base = (old !== null && typeof old === "object" ? old : {}) as RunStats;
  const next = (update !== null && typeof update === "object" ? update : {}) as RunStats;
  const merged: RunStats = { ...base };
  for (const key of [
    "pagesVisited",
    "charsSeen",
    "docsParsed",
    "chunksWritten",
    "embedTokensEstimated",
  ] as const) {
    const value = next[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      merged[key] = Math.max(merged[key] ?? 0, value);
    }
  }
  return merged;
}

export async function POST(req: NextRequest) {
  if (!verifyWorkerSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const runId = typeof body?.runId === "string" ? body.runId : "";
  const type = body?.type;
  if (!runId || (type !== "progress" && type !== "complete" && type !== "failed")) {
    return NextResponse.json({ error: "runId and a valid type are required." }, { status: 400 });
  }
  const run = await prisma.onboardingRun.findUnique({ where: { id: runId } });
  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
  if (run.status === "COMPLETE" || run.status === "PARTIAL" || run.status === "FAILED") {
    return NextResponse.json({ stop: true });
  }

  if (type === "failed") {
    const error = typeof body?.error === "string" && body.error ? body.error.slice(0, 500) : "Worker failed.";
    await prisma.onboardingRun.update({ where: { id: runId }, data: { status: "FAILED", error } });
    return NextResponse.json({ stop: true });
  }

  const stats = mergeStats(run.stats, body?.stats);
  const breach = overBudget(stats);
  if (breach) {
    await prisma.onboardingRun.update({
      where: { id: runId },
      data: {
        status: "PARTIAL",
        stats: { ...stats, truncated: true, truncateReason: `app ceiling: ${breach}` },
      },
    });
    return NextResponse.json({ stop: true });
  }

  if (type === "complete") {
    const truncated = body?.stats?.truncated === true;
    await prisma.onboardingRun.update({
      where: { id: runId },
      data: { status: truncated ? "PARTIAL" : "COMPLETE", stats: { ...stats, truncated } },
    });
    return NextResponse.json({ stop: true });
  }

  await prisma.onboardingRun.update({ where: { id: runId }, data: { status: "RUNNING", stats } });
  return NextResponse.json({ stop: false });
}
