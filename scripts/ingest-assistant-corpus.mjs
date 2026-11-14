// Lane A platform-corpus ingestion (Handover R1). Founder-run on the VM
// (has network + DIRECT_URL + GEMINI_API_KEY); no scheduler in R1.
//
//   node --no-warnings --experimental-transform-types \
//     --loader ./scripts/esm-alias-loader.mjs \
//     scripts/ingest-assistant-corpus.mjs [--dry-run] [--force] [--docs-only] [--curated-only]
//
// Fetches the published docs pages, chunks + embeds them with the same
// Gemini pipeline as property knowledge, and upserts them as platform
// documents (propertyId NULL), plus the curated business /
// troubleshooting / subscription entries. Per-document delete+insert
// makes re-runs idempotent; per-page failures are reported, never fatal.
// Prints corpus row counts per source for the PR/evidence record.
//
// R1.1 pacing: already-stored sources are skipped (no embed call) unless
// --force; each document's embed call waits INGEST_EMBED_DELAY_MS first
// (default 4000, 0 disables; the run's first call is not delayed); one
// progress line prints per stored document; exit code is non-zero when
// anything failed, so a re-run completes the missing pieces.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { embedMany } from "@/lib/embeddings";
import { toVectorLiteral } from "@/lib/rag";
import {
  DOCS_BASE,
  DOCS_PAGES,
  ingestAssistantCorpus,
  parseSitemapXml,
} from "@/lib/assistant-ingest";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");
const ONLY = args.has("--docs-only") && !args.has("--curated-only")
  ? "docs"
  : args.has("--curated-only") && !args.has("--docs-only")
    ? "curated"
    : undefined;
const EMBED_DELAY_MS = Number.parseInt(process.env.INGEST_EMBED_DELAY_MS ?? "4000", 10);
const PACING_MS = Number.isFinite(EMBED_DELAY_MS) && EMBED_DELAY_MS > 0 ? EMBED_DELAY_MS : 0;

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "ViveReplyAssistantIngest/1.0 (+https://www.vivereply.com)" },
    });
    return { status: res.status, html: await res.text().catch(() => "") };
  } finally {
    clearTimeout(timer);
  }
}

async function discoverSitemap() {
  for (const candidate of [`${DOCS_BASE}/sitemap.xml`, "https://www.vivereply.com/sitemap.xml"]) {
    try {
      const res = await fetchPage(candidate);
      if (res.status !== 200) continue;
      const paths = parseSitemapXml(res.html);
      if (paths && paths.length > 0) {
        console.log(`Discovered ${paths.length} docs pages via ${candidate}`);
        return paths;
      }
    } catch {
      // fall through to the next candidate, then the curated list
    }
  }
  console.log(`Sitemap discovery failed; falling back to ${DOCS_PAGES.length} curated docs pages.`);
  return null;
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Set DIRECT_URL (or DATABASE_URL) to the target database first.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("Set GEMINI_API_KEY first (same key the app uses for embeddings).");
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg(new pg.Pool({ connectionString })) });
  try {
    // Skip-if-stored: sources already in the platform corpus are never
    // re-embedded (idempotent re-runs after a 429 death). --force and
    // --dry-run both disable skipping (dry runs write nothing).
    let skipSources = [];
    if (!DRY_RUN && !FORCE) {
      const stored = await prisma.knowledgeDocument.findMany({
        where: { propertyId: null },
        select: { source: true },
      });
      skipSources = stored.map((r) => r.source);
      if (skipSources.length > 0) {
        console.log(`Skipping ${skipSources.length} already-stored source(s) (pass --force to re-embed).`);
      }
    }

    let embedCalls = 0;
    const pacedEmbed = async (texts) => {
      embedCalls += 1;
      if (PACING_MS > 0 && embedCalls > 1) {
        await new Promise((resolve) => setTimeout(resolve, PACING_MS));
      }
      return embedMany(texts);
    };

    const replaceDocument = async (doc, embeddings) => {
      if (DRY_RUN) return doc.chunks.length;
      await prisma.knowledgeDocument.deleteMany({ where: { propertyId: null, source: doc.source } });
      const created = await prisma.knowledgeDocument.create({
        data: { title: doc.title, source: doc.source, content: doc.chunks.join("\n\n"), propertyId: null },
      });
      for (let i = 0; i < doc.chunks.length; i += 1) {
        await prisma.$executeRaw`INSERT INTO "KnowledgeChunk" ("id", "documentId", "content", "embedding", "indexed", "createdAt") VALUES (${randomUUID()}, ${created.id}, ${doc.chunks[i]}, ${toVectorLiteral(embeddings[i])}::vector, true, NOW())`;
      }
      console.log(`[ingest] ${doc.source} — ${doc.chunks.length} chunk(s)`);
      return doc.chunks.length;
    };

    const report = await ingestAssistantCorpus({
      fetchPage,
      discoverSitemap,
      embed: pacedEmbed,
      replaceDocument,
      skipSources,
      only: ONLY,
    });

    const ok = report.pages.filter((p) => p.status === "ok");
    const skipped = report.pages.filter((p) => p.status === "skipped");
    const failed = report.pages.filter((p) => p.status === "failed");
    const curatedFailed = report.curated.filter((c) => c.status === "failed");
    const curatedSkipped = report.curated.filter((c) => c.status === "skipped");
    console.log(`\nDocs pages: ${ok.length} ingested, ${skipped.length} skipped, ${failed.length} failed (of ${report.pages.length}).`);
    for (const p of [...skipped, ...failed]) console.log(`  [${p.status}] ${p.path}${p.detail ? ` — ${p.detail}` : ""}`);
    console.log(
      `Curated documents: ${report.curatedDocuments} ingested, ${curatedSkipped.length} skipped, ${curatedFailed.length} failed.`
    );
    for (const c of [...curatedSkipped, ...curatedFailed]) {
      console.log(`  [${c.status}] curated:${c.id}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    console.log(`Total: ${report.documents} documents, ${report.chunks} chunks${DRY_RUN ? " (dry run — nothing written)" : ""}.`);

    if (!DRY_RUN) {
      const rows = await prisma.knowledgeDocument.groupBy({
        by: ["source"],
        where: { propertyId: null },
        _count: { id: true },
      });
      console.log("\nPlatform corpus row counts per source:");
      for (const row of rows) console.log(`  ${row.source}: ${row._count.id} document(s)`);
      const chunkCount = await prisma.knowledgeChunk.count({ where: { document: { propertyId: null } } });
      console.log(`  → ${chunkCount} platform chunk(s) in total.`);
    }

    if (failed.length > 0 || curatedFailed.length > 0) {
      console.error("\nSome documents failed — re-run (without --force) to complete only the missing ones.");
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Ingestion failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
