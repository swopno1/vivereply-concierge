// Per-tenant chat throttle (fixed one-minute windows, DB-backed).
// One property's traffic spike must never starve another tenant's
// guests or burn the shared model budget — the noisy-neighbour guard.
// DB-backed because serverless instances share no memory; only the
// database counts globally. Limit from CHAT_RATE_LIMIT_PER_MIN
// (default 60 turns/min/property); 0 disables (tests, local dev).

import { prisma } from "@/lib/prisma";

export const RATE_WINDOW_MS = 60_000;

export function rateLimitPerMinute(): number {
  const raw = Number(process.env.CHAT_RATE_LIMIT_PER_MIN ?? "60");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 60;
}

export function ipRateLimitPerMinute(): number {
  const raw = Number(process.env.CHAT_RATE_LIMIT_IP_PER_MIN ?? "30");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 30;
}

// Pure bucket math (unit-tested): the window a timestamp falls in.
export function windowStartOf(now: Date): Date {
  return new Date(Math.floor(now.getTime() / RATE_WINDOW_MS) * RATE_WINDOW_MS);
}

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSec: number };

// Atomic increment-or-create: concurrent turns serialize on the
// @@id row, so the count is exact, not approximate. Best-effort
// prune of windows older than 2h rides along (failures swallowed —
// prune must never fail a turn).
export async function checkChatRate(propertyId: string, now = new Date()): Promise<RateDecision> {
  const limit = rateLimitPerMinute();
  if (limit === 0) return { allowed: true };
  const windowStart = windowStartOf(now);
  // Fail OPEN with an alarm: the throttle is a guardrail, not the
  // product — a sick bucket table must never halt every turn (lived
  // through exactly this: code deployed before `prisma db push`).
  // Abuse risk is nil (callers can't break the table through the API).
  let row: { count: number };
  try {
    row = await prisma.rateBucket.upsert({
      where: { propertyId_windowStart: { propertyId, windowStart } },
      create: { propertyId, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
  } catch (e) {
    console.error("chat throttle blind (allowing turn):", e instanceof Error ? e.message : e);
    return { allowed: true };
  }
  prisma.rateBucket
    .deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 2 * 3600_000) } } })
    .catch(() => null);
  if (row.count <= limit) return { allowed: true };
  const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + RATE_WINDOW_MS - now.getTime()) / 1000));
  return { allowed: false, retryAfterSec };
}

// Same shape, keyed by client IP. A single scraper behind one address
// gets cut off long before it can spend the property's whole budget.
export async function checkChatRateByIp(ip: string, now = new Date()): Promise<RateDecision> {
  const limit = ipRateLimitPerMinute();
  if (limit === 0 || !ip) return { allowed: true };
  const windowStart = windowStartOf(now);
  const key = ip.slice(0, 80);
  // Fail open with an alarm, same as the per-tenant check above.
  let row: { count: number };
  try {
    row = await prisma.ipRateBucket.upsert({
      where: { ip_windowStart: { ip: key, windowStart } },
      create: { ip: key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
  } catch (e) {
    console.error("chat IP throttle blind (allowing turn):", e instanceof Error ? e.message : e);
    return { allowed: true };
  }
  prisma.ipRateBucket
    .deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 2 * 3600_000) } } })
    .catch(() => null);
  if (row.count <= limit) return { allowed: true };
  const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + RATE_WINDOW_MS - now.getTime()) / 1000));
  return { allowed: false, retryAfterSec };
}
