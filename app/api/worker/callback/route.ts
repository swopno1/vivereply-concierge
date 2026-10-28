// Ingestion worker callback (RAG onboarding). The cloud worker reports
// here; the app owns budgets, embeddings, and the database.
//   POST /api/worker/callback  Authorization: Bearer <WORKER_SHARED_SECRET>
//   { runId, type: "progress", stats }
//   { runId, type: "chunks", chunks: [{ title, content, source }], stats }
//   { runId, type: "complete", stats }
//   { runId, type: "failed", error }
// Every reply is { stop: boolean } — true tells the worker to halt (used
// when the token ceiling trips or the run already ended). Chunk batches are
// capped per call so one callback cannot smuggle a run past its budget.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyWorkerSecret } from "@/lib/worker";
import { embedMany } from "@/lib/embeddings";
import { toVectorLiteral } from "@/lib/rag";
import { estimateTokens, overBudget, type RunStats } from "@/lib/onboarding";

const MAX_CHUNKS_PER_CALL = 50;
const MAX_CHUNK_CHARS = 8000;

type IncomingChunk = { title: unknown; content: unknown; source: unknown };

function cleanChunks(raw: unknown): { title: string; content: string; source: string }[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CHUNKS_PER_CALL) return null;
  const out: { title: string; content: string; source: string }[] = [];
  for (const item of raw as IncomingChunk[]) {
    const title = typeof item?.title === "string" ? item.title.trim().slice(0, 200) : "";
    const content = typeof item?.content === "string" ? item.content.trim().slice(0, MAX_CHUNK_CHARS) : "";
    const source = typeof item?.source === "string" ? item.source.trim().slice(0, 300) : "";
    if (!title || !content) return null;
    out.push({ title, content, source: source || "worker" });
  }
  return out;
}

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
  if (!runId || (type !== "progress" && type !== "chunks" && type !== "complete" && type !== "failed")) {
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

  if (type === "progress") {
    const stats = mergeStats(run.stats, body?.stats);
    await prisma.onboardingRun.update({ where: { id: runId }, data: { status: "RUNNING", stats } });
    return NextResponse.json({ stop: overBudget(stats) !== null });
  }

  if (type === "complete") {
    const stats = mergeStats(run.stats, body?.stats);
    const truncated = overBudget(stats) !== null || body?.stats?.truncated === true;
    await prisma.onboardingRun.update({
      where: { id: runId },
      data: { status: truncated ? "PARTIAL" : "COMPLETE", stats: { ...stats, truncated } },
    });
    return NextResponse.json({ stop: true });
  }

  // type === "chunks": enforce the ceiling BEFORE embedding anything, then
  // embed + upsert grouped by (title, source) so batches append to the
  // same documents instead of duplicating them.
  const chunks = cleanChunks(body?.chunks);
  if (!chunks) {
    return NextResponse.json(
      { error: `chunks must be 1-${MAX_CHUNKS_PER_CALL} items with title + content.` },
      { status: 400 }
    );
  }
  const batchTokens = estimateTokens(chunks.reduce((sum, c) => sum + c.content.length, 0));
  const stats = mergeStats(run.stats, body?.stats);
  stats.chunksWritten = (stats.chunksWritten ?? 0) + chunks.length;
  stats.embedTokensEstimated = (stats.embedTokensEstimated ?? 0) + batchTokens;
  const breach = overBudget(stats);
  if (breach) {
    await prisma.onboardingRun.update({
      where: { id: runId },
      data: {
        status: "PARTIAL",
        stats: { ...stats, truncated: true, truncateReason: breach },
      },
    });
    return NextResponse.json({ stop: true });
  }
  let vectors: number[][];
  try {
    vectors = await embedMany(chunks.map((c) => c.content));
  } catch (e) {
    await prisma.onboardingRun.update({
      where: { id: runId },
      data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "Embedding failed." },
    });
    return NextResponse.json({ stop: true });
  }
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] as { title: string; content: string; source: string };
    let doc = await prisma.knowledgeDocument.findFirst({
      where: { propertyId: run.propertyId, title: chunk.title, source: chunk.source },
    });
    if (!doc) {
      doc = await prisma.knowledgeDocument.create({
        data: { propertyId: run.propertyId, title: chunk.title, source: chunk.source, content: chunk.content },
      });
    }
    await prisma.$executeRaw`INSERT INTO "KnowledgeChunk" ("id", "documentId", "content", "embedding", "createdAt") VALUES (${randomUUID()}, ${doc.id}, ${chunk.content}, ${toVectorLiteral(vectors[i] as number[])}::vector, NOW())`;
  }
  await prisma.onboardingRun.update({ where: { id: runId }, data: { status: "RUNNING", stats } });
  return NextResponse.json({ stop: false });
}
