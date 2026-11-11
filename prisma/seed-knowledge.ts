// Seed curated property knowledge (run by the founder, never in CI):
//   pnpm exec tsx prisma/seed-knowledge.ts -- --property=<live-property-id>
//
// The demo corpus (demo-config/knowledge.ts: check-in, halal dining,
// Family Gathering Week canary, about, help). Use when the onboarding
// crawl cannot reach the site (e.g. the resort's robots.txt blocks
// crawlers — the worker respects it) or for a deterministic corpus
// behind eval/probes. Retrieval is property-scoped, so the property ID
// is REQUIRED: `--property=` or DEMO_PROPERTY_ID env. Seeding the wrong
// property makes the docs invisible to the right chat (fail-loud by
// design — there is no silent default).
//
// Requires, in order: pgvector enabled in the Concierge Supabase project
// (Dashboard → SQL Editor: CREATE EXTENSION IF NOT EXISTS vector; —
// the script tries it first, but if that fails run it by hand, then
// re-run this script), `prisma db push` already run for the new
// KnowledgeDocument / KnowledgeChunk tables, and GEMINI_API_KEY in
// .env.local (embeddings only — never commit it).
//
// Idempotent per property: deletes that property's existing demo-seed
// documents first (chunks cascade), then re-embeds every document in
// demo-config/knowledge.ts. One chunk per document — every document is
// short enough to embed whole.
// The embedding column is Prisma Unsupported("vector(768)"), so chunks
// are inserted with raw SQL; Prisma cannot write that column directly.

import { randomUUID } from "node:crypto";
import "../lib/env";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { embedText } from "../lib/embeddings";
import { toVectorLiteral } from "../lib/rag";
import { KNOWLEDGE_DOCS } from "../demo-config/knowledge";

// RLS service path: seeds write unscoped rows, which the app role could
// never insert — so this script connects via DIRECT_URL (the bypass
// migrations connection), never the app pooler.
const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DIRECT_URL })),
});

async function main(): Promise<void> {
  try {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log("pgvector extension: ok");
  } catch {
    console.log(
      "WARNING: could not CREATE EXTENSION vector from here — enable it in the Supabase SQL Editor, then re-run this script."
    );
  }

  const propertyArg = process.argv.find((a) => a.startsWith("--property="));
  const propertyId = (propertyArg ? propertyArg.slice("--property=".length) : process.env.DEMO_PROPERTY_ID ?? "").trim();
  if (!propertyId) {
    console.error(
      "Refusing: pass the live property ID (--property=<id> or DEMO_PROPERTY_ID). " +
        "Retrieval is property-scoped — a default would seed docs no chat can see."
    );
    process.exitCode = 1;
    return;
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    console.error(`Refusing: no Property row "${propertyId}" — check the ID (signup-created IDs carry a suffix).`);
    process.exitCode = 1;
    return;
  }

  const deleted = await prisma.knowledgeDocument.deleteMany({ where: { source: "demo-seed", propertyId } });
  console.log(`Removed ${deleted.count} existing demo-seed document(s) for ${propertyId}.`);

  for (const doc of KNOWLEDGE_DOCS) {
    const created = await prisma.knowledgeDocument.create({
      data: { title: doc.title, source: "demo-seed", content: doc.content, propertyId },
    });
    const embedding = await embedText(doc.content, "RETRIEVAL_DOCUMENT");
    await prisma.$executeRaw`INSERT INTO "KnowledgeChunk" ("id", "documentId", "content", "embedding", "createdAt") VALUES (${randomUUID()}, ${created.id}, ${doc.content}, ${toVectorLiteral(embedding)}::vector, NOW())`;
    console.log(`Seeded: ${doc.title} (${embedding.length} dimensions)`);
  }

  const chunkCount = await prisma.knowledgeChunk.count();
  console.log(`Done. ${KNOWLEDGE_DOCS.length} document(s), ${chunkCount} chunk(s) in total.`);
}

main()
  .catch((e) => {
    console.error("Knowledge seed failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
