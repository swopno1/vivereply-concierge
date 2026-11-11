// Tenant transaction wrapper (Phase 1 RLS). Runs fn inside ONE
// interactive transaction on ONE pooled connection, with
// app.tenant_id SET LOCAL first — the setting and the queries share
// a connection by construction, and SET LOCAL dies with the
// transaction, so a returned connection can never serve the next
// tenant with a stale id (PgBouncer additionally resets server
// connections post-transaction — defense in depth, not relied upon).
// RULES (review-enforced; the nesting guard throws):
//   - Helpers that take a verified propertyId wrap their own queries;
//     routes wrap only their DIRECT queries. Never nest withTenant:
//     one level, always (nesting would split atomicity silently).
//   - Never hold a tenant transaction across network/LLM calls —
//     segment long routes (chat!) into load/compute/save phases, or
//     the max-5 pool starves. A timed-out transaction fails loud.
//   - Empty tenant throws: fail closed, never silent demo.
// This module is a LEAF (prisma + async_hooks only, no next/headers)
// so unit-tested lib modules can import it without breaking plain
// node. Import it directly (@/lib/tenant-db) from routes, helpers,
// and lib/tenant.ts alike — one path, no re-export.

import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Transaction client handed to withTenant callbacks: the full Prisma
// delegate surface, bound to one transaction on one connection.
export type TenantTx = Prisma.TransactionClient;

// Minimal session shape for tenant resolution (role + property only —
// full Session lives in lib/tenant.ts, which imports next/headers).
export type TenantSession = {
  role: "SUPER_ADMIN" | "OWNER";
  propertyId: string | null;
};

// Which tenant a request's withTenant blocks run as. OWNER → the
// session's own verified property (never the request's — the request
// id passed sessionCan already, but the session is the verified
// source). SUPER_ADMIN acting on one property → that validated
// request id. Null (fail closed — the caller 401s) when neither
// yields an id: cross-property scans do not use this (they take the
// marked service path instead). Pure — unit-tested.
export function tenantFor(session: TenantSession, requestPropertyId?: string | null): string | null {
  if (session.role === "OWNER") return session.propertyId;
  const id = (requestPropertyId ?? "").trim();
  return id ? id : null;
}

const tenantDepth = new AsyncLocalStorage<number>();

export async function withTenant<T>(propertyId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  if (!propertyId) {
    throw new Error("withTenant: empty tenant (fail closed).");
  }
  if ((tenantDepth.getStore() ?? 0) > 0) {
    throw new Error("withTenant: nesting forbidden — wrap once per level (see lib/tenant-db.ts).");
  }
  return tenantDepth.run(1, () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${propertyId}, true)`;
      return fn(tx);
    })
  );
}
