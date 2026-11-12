// Tenant session helpers (multi-tenant core, auth Tier 1). Every protected
// page and /api/admin/* route goes through here — no direct cookie reads
// elsewhere.
//   - getSession: the current LIVE session or null (never throws). Live
//     means: cookie signature valid AND the Session row exists, unrevoked,
//     unexpired, and within the idle window. lastSeenAt is touched at most
//     every 5 minutes (one conditional write, not one per request).
//   - sessionCan(session, propertyId): SUPER_ADMIN can touch anything;
//     OWNER only its own property; nobody touches anything signed out.
//   - resolvePropertyId(session, param): which property a page acts for.
//     OWNER is pinned to its own (a ?property= override is ignored, not
//     an error; a null propertyId throws — fail closed, never demo).
//     SUPER_ADMIN may pass ?property=<active-id>, else the configured
//     demo property — and when no demo property is configured (unset
//     DEMO_PROPERTY_ID, i.e. production), no selection throws instead
//     of silently serving a special property. Signed-out callers never
//     reach this (pages redirect to login first).
//   - revokeSession / revokeUserSessions: the kill switches logout,
//     password change, and admin revoke act through.
//   - withTenant: run tenant-table queries with app.tenant_id set (the
//     RLS path — see below). Auth bootstrap + cross-property reads use
//     the bypass service client instead (prismaService, explicitly
//     marked at each call site, listed in the Phase 1 PR).

import { cookies } from "next/headers";
import { demoPropertyId } from "./demo";
import { prisma, prismaService } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import {
  ADMIN_SESSION_COOKIE,
  SESSION_ABSOLUTE_DAYS,
  SESSION_IDLE_HOURS,
  createSessionToken,
  verifySessionToken,
  type Session,
} from "@/lib/auth";

export type { Session };

const TOUCH_EVERY_MS = 5 * 60 * 1000;

export function sessionExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_ABSOLUTE_DAYS * 24 * 3600 * 1000);
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const session = verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) return null;
  // SERVICE PATH (marked): the session row is read before any tenant is
  // established (and super-admin sessions have no property at all), so
  // it cannot go through withTenant. The unguessable sid + verified
  // signature are the authorization here, not RLS.
  const db = prismaService();
  const row = await db.session.findUnique({ where: { id: session.sid } }).catch(() => null);
  if (!row || row.revokedAt) return null;
  const now = new Date();
  if (row.expiresAt <= now) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_IDLE_HOURS * 3600 * 1000) return null;
  // Belt and braces: the row must agree with the signed payload on who and
  // which role — a row swapped under a valid signature still fails closed.
  const rowUid = row.userId ?? "bootstrap";
  if (rowUid !== session.uid || row.role !== session.role) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.session.update({ where: { id: row.id }, data: { lastSeenAt: now } }).catch(() => null);
  }
  // Suspension bites existing sessions too: an OWNER whose property is no
  // longer ACTIVE loses the session on next use. SUPER_ADMIN (no property)
  // skips this check.
  if (session.role === "OWNER") {
    if (!session.propertyId || !(await isPropertyActive(session.propertyId))) return null;
  }
  return session;
}

// SERVICE PATH (marked): session lifecycle writes address exact session
// ids from verified cookies, including super-admin sessions that have
// no property — so they bypass tenant scoping by design.
export async function revokeSession(sid: string): Promise<void> {
  await prismaService().session.updateMany({
    where: { id: sid, revokedAt: null },
    data: { revokedAt: new Date() },
  }).catch(() => null);
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const result = await prismaService().session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  }).catch(() => null);
  return result?.count ?? 0;
}

// Completes a login AFTER all credential checks passed. Called from
// /api/auth/login (password-only accounts) and /api/auth/login/verify
// (after the 2FA code) so session minting exists exactly once: fresh
// server-side row, signed cookie value, login.success audit. SERVICE
// PATH (marked): session lifecycle. Returns null when minting failed
// (row rolled back) — callers answer 500, never a half-session.
export async function mintLoginSession(args: {
  session: Omit<Session, "sid">;
  userId: string | null;
  ip: string;
}): Promise<{ token: string; role: Session["role"]; propertyId: string | null } | null> {
  const row = await prismaService().session
    .create({ data: { userId: args.userId, role: args.session.role, expiresAt: sessionExpiresAt() } })
    .catch(() => null);
  if (!row) return null;
  const token = createSessionToken({ ...args.session, sid: row.id });
  if (!token) {
    await prismaService().session.delete({ where: { id: row.id } }).catch(() => null);
    return null;
  }
  await logAudit({
    actorEmail: args.session.email,
    action: "login.success",
    propertyId: args.session.propertyId,
    detail: { role: args.session.role },
    ip: args.ip,
  });
  return { token, role: args.session.role, propertyId: args.session.propertyId };
}

export function sessionCan(session: Session | null, propertyId: string): boolean {
  if (!session || !propertyId) return false;
  if (session.role === "SUPER_ADMIN") return true;
  return session.propertyId === propertyId;
}

// Verification gate (public signup). SUPER_ADMIN (bootstrap or row) is
// always verified — the team attests itself. OWNERs must have proven
// their email via the signup link. Config surfaces (Settings,
// onboarding, owner admin APIs) call this AFTER the session/can
// checks; reading surfaces (chat, /staff) do not.
export async function sessionOwnerVerified(session: Session | null): Promise<boolean> {
  if (!session) return false;
  if (session.role === "SUPER_ADMIN") return true;
  if (!session.uid || session.uid === "bootstrap") return false;
  // Tenant path: the User row is read with the session's own verified
  // property as tenant (callers must not wrap this call — helpers wrap
  // internally; the nesting guard throws).
  const tenant = session.propertyId;
  if (!tenant) return false;
  const user = await withTenant(tenant, (tx) =>
    tx.user.findUnique({ where: { id: session.uid }, select: { emailVerifiedAt: true } })
  ).catch(() => null);
  return user?.emailVerifiedAt != null;
}

// Tenant kill-switch predicate. ACTIVE means live; anything else means
// suspended — including a MISSING row (Phase 1 killed the demo no-row
// fallback: the demo serves only through its explicit seeded Property
// row, and a missing row fails closed everywhere this is checked).
export async function isPropertyActive(propertyId: string): Promise<boolean> {
  const row = await prisma.property.findUnique({ where: { id: propertyId } }).catch(() => null);
  if (!row) return false;
  return row.status === "ACTIVE";
}

export async function resolvePropertyId(
  session: Session | null,
  param: string | null | undefined
): Promise<string> {
  if (session && session.role === "OWNER") {
    // Owner sessions always carry a property (verifySessionToken rejects
    // OWNER without one) — a null here fails closed, never silent demo.
    if (!session.propertyId) throw new Error("OWNER session without propertyId (fail closed).");
    return session.propertyId;
  }
  if (session && param) {
    const row = await prisma.property.findUnique({ where: { id: param } }).catch(() => null);
    if (row && row.status === "ACTIVE") return row.id;
  }
  // No valid selection: the configured demo property, or a fail-closed
  // throw when none is configured. A super-admin page opened without
  // ?property= in production lands on the error boundary — honest, and
  // the fix is the URL: append ?property=<active-id>.
  const demo = demoPropertyId();
  if (!demo) {
    throw new Error("No property selected (?property=<id>) and DEMO_PROPERTY_ID is not set.");
  }
  return demo;
}
