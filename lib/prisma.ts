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

// Bypass service client (Phase 1 RLS). Used ONLY by explicitly-marked
// service paths: auth bootstrap (login/signup/verify/reset user, token
// and session ops), getSession's session-row read, super-admin
// cross-property reads, and widget-key resolution. Everything else runs
// tenant-scoped on `prisma` inside withTenant (lib/tenant.ts).
// SERVICE_DATABASE_URL must point at a BYPASS role (same value as
// DIRECT_URL today — see .env.example). Lazy singleton: throws loudly
// at first service use when unset, so unit tests and pages that never
// need it are unaffected by a missing var.
const globalForPrismaService = globalThis as unknown as { prismaService?: PrismaClient };

export function prismaService(): PrismaClient {
  if (!globalForPrismaService.prismaService) {
    const url = process.env.SERVICE_DATABASE_URL;
    if (!url) {
      throw new Error("SERVICE_DATABASE_URL is not set — service paths need a bypass connection (see .env.example).");
    }
    // max 2: service queries are tiny point reads/writes (session rows,
    // token rows, key lookups) — a small pool is plenty, and a stuck
    // service pool must never starve the tenant pool (separate Pool).
    const pool = new Pool({ connectionString: url, max: 2 });
    globalForPrismaService.prismaService = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  return globalForPrismaService.prismaService;
}
