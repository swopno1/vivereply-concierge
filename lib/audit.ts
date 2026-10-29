// Admin audit trail (who did what, when). Writes ride on security-
// relevant mutations: logins (success + fail), signup, domain add/
// toggle/remove, bridge key mint/revoke, binding save/remove/test,
// owner activate/deactivate, property suspend/resume, manual payment
// confirm. Reads are super-admin-only (GET /api/admin/audit +
// Settings Tenants room). Never-throw by design: a lost row is
// logged to the server console, but audit must never break the
// request it records. Never log secrets — names, ids, and outcomes
// only (bridge secrets and Suite keys must never appear here).

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded?.split(",")[0] ?? "").trim();
  return ip || null;
}

export async function logAudit(args: {
  actorEmail?: string | null;
  action: string;
  propertyId?: string | null;
  detail?: Prisma.InputJsonValue;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorEmail: args.actorEmail ?? null,
        action: args.action,
        propertyId: args.propertyId ?? null,
        detail: args.detail ?? undefined,
        ip: args.ip ?? null,
      },
    });
  } catch (e) {
    console.error("audit write failed:", e instanceof Error ? e.message : e);
  }
}
