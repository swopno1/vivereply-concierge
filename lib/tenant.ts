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
//     an error). SUPER_ADMIN may pass ?property=<active-id>, else the demo
//     property. Signed out also yields the demo property (public chat).
//   - revokeSession / revokeUserSessions: the kill switches logout,
//     password change, and admin revoke act through.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  SESSION_ABSOLUTE_DAYS,
  SESSION_IDLE_HOURS,
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
  const row = await prisma.session.findUnique({ where: { id: session.sid } }).catch(() => null);
  if (!row || row.revokedAt) return null;
  const now = new Date();
  if (row.expiresAt <= now) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_IDLE_HOURS * 3600 * 1000) return null;
  // Belt and braces: the row must agree with the signed payload on who and
  // which role — a row swapped under a valid signature still fails closed.
  const rowUid = row.userId ?? "bootstrap";
  if (rowUid !== session.uid || row.role !== session.role) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: now } }).catch(() => null);
  }
  // Suspension bites existing sessions too: an OWNER whose property is no
  // longer ACTIVE loses the session on next use. SUPER_ADMIN (no property)
  // skips this check.
  if (session.role === "OWNER") {
    if (!session.propertyId || !(await isPropertyActive(session.propertyId))) return null;
  }
  return session;
}

export async function revokeSession(sid: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sid, revokedAt: null },
    data: { revokedAt: new Date() },
  }).catch(() => null);
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  }).catch(() => null);
  return result?.count ?? 0;
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
  const user = await prisma.user
    .findUnique({ where: { id: session.uid }, select: { emailVerifiedAt: true } })
    .catch(() => null);
  return user?.emailVerifiedAt != null;
}

export function demoPropertyId(): string {
  return process.env.DEMO_PROPERTY_ID ?? "krishnachura-retreat";
}

// Tenant kill-switch predicate. ACTIVE means live; anything else (or a
// missing row for a non-demo property) means suspended. The demo property
// keeps its no-row fallback so a fresh DB still serves the demo; every
// other property fails closed.
export async function isPropertyActive(propertyId: string): Promise<boolean> {
  const row = await prisma.property.findUnique({ where: { id: propertyId } }).catch(() => null);
  if (!row) return propertyId === demoPropertyId();
  return row.status === "ACTIVE";
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
