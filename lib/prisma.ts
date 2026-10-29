import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Singleton for Next.js dev (avoids exhausting connections on hot reload).
// Runtime connects via the shared transaction-mode pooler; migrations and
// Prisma CLI commands use DIRECT_URL via prisma.config.ts.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // max 5 per serverless instance: every Vercel instance opens its own
  // pool, so an unbounded default fans out into hundreds of pooler
  // connections under load. 5 is plenty — turns are short queries,
  // not long transactions — and the pooler queues the overflow.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
