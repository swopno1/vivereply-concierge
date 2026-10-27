// Seed step-3 property knowledge (run by the founder, never in CI):
//   pnpm exec tsx prisma/seed-knowledge.ts
//
// Requires, in order: pgvector enabled in the Concierge Supabase project
// (Dashboard → SQL Editor: CREATE EXTENSION IF NOT EXISTS vector; —
// the script tries it first, but if that fails run it by hand, then
// re-run this script), `prisma db push` already run for the new
// KnowledgeDocument / KnowledgeChunk tables, and GEMINI_API_KEY in
// .env.local (embeddings only — never commit it).
//
// Idempotent: deletes existing demo-seed documents first (chunks cascade),
// then re-embeds every document in demo-config/knowledge.ts. One chunk
// per document — every document is short enough to embed whole.
// The embedding column is Prisma Unsupported("vector(768)"), so chunks
// are inserted with raw SQL; Prisma cannot write that column directly.

import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { embedText } from "../lib/embeddings";
import { toVectorLiteral } from "../lib/rag";
import { KNOWLEDGE_DOCS } from "../demo-config/knowledge";

async function main(): Promise<void> {
  try {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log("pgvector extension: ok");
  } catch {
    console.log(
      "WARNING: could not CREATE EXTENSION vector from here — enable it in the Supabase SQL Editor, then re-run this script."
    );
  }

  const deleted = await prisma.knowledgeDocument.deleteMany({ where: { source: "demo-seed" } });
  console.log(`Removed ${deleted.count} existing demo-seed document(s).`);

  for (const doc of KNOWLEDGE_DOCS) {
    const created = await prisma.knowledgeDocument.create({
      data: { title: doc.title, source: "demo-seed", content: doc.content },
    });
    const embedding = await embedText(doc.content);
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
