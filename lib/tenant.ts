// Tenant session helpers (multi-tenant core). Every protected page and
// /api/admin/* route goes through here — no direct cookie reads elsewhere.
//   - getSession: the current session or null (never throws).
//   - sessionCan(session, propertyId): SUPER_ADMIN can touch anything;
//     OWNER only its own property; nobody touches anything signed out.
//   - resolvePropertyId(session, param): which property a page acts for.
//     OWNER is pinned to its own (a ?property= override is ignored, not
//     an error). SUPER_ADMIN may pass ?property=<active-id>, else the demo
//     property. Signed out also yields the demo property (public chat).

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/auth";

export type { Session };

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
}

export function sessionCan(session: Session | null, propertyId: string): boolean {
  if (!session || !propertyId) return false;
  if (session.role === "SUPER_ADMIN") return true;
  return session.propertyId === propertyId;
}

export function demoPropertyId(): string {
  return process.env.DEMO_PROPERTY_ID ?? "krishnachura-retreat";
}

export async function resolvePropertyId(
  session: Session | null,
  param: string | null | undefined
): Promise<string> {
  if (session && session.role === "OWNER") return session.propertyId ?? demoPropertyId();
  if (session && param) {
    const row = await prisma.property.findUnique({ where: { id: param } }).catch(() => null);
    if (row && row.status === "ACTIVE") return row.id;
  }
  return demoPropertyId();
}
