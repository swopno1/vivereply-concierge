// Public reset API (Phase 0; the token IS the auth — same shape as the
// verify-email link check, but as a POST that sets state).
//   POST /api/auth/reset-password { token, password } -> { ok: true, relogin: true }
// Token: 32-byte random, SHA-256 at rest, 1h expiry, single use.
// Success sets the scrypt hash (min MIN_PASSWORD_LEN), clears
// mustChangePassword (mirrors PATCH /api/auth/password — a reset
// password is owner-chosen, never temporary), marks the token used,
// revokes ALL of the user's sessions, and clears the cookie: the
// owner logs in again with the new password. Invalid/expired/used
// token, or an inactive user: 400, no user info in the response.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
// SERVICE PATH (marked): auth bootstrap runs before any tenant exists — bypass client by design (see Phase 1 PR service-path list).
import { prismaService } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, MIN_PASSWORD_LEN, hashPassword } from "@/lib/auth";
import { revokeUserSessions } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

function clientIp(req: NextRequest): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (first || "unknown").slice(0, 80);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const ip = clientIp(req);
  if (!token) {
    return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `The new password must be at least ${MIN_PASSWORD_LEN} characters.` },
      { status: 400 }
    );
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await prismaService().passwordResetToken
    .findUnique({ where: { tokenHash }, include: { user: true } })
    .catch(() => null);
  const live = row && !row.usedAt && row.expiresAt > new Date() && row.user.active;
  if (!live || !row) {
    return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  }
  // Atomic: token-mark + password-set land together or not at all,
  // so a failure is retry-safe (the link stays live).
  const updated = await prismaService()
    .$transaction([
      prismaService().passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prismaService().user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(password), mustChangePassword: false },
      }),
    ])
    .catch(() => null);
  if (!updated) {
    return NextResponse.json({ error: "The reset could not be completed. Try again." }, { status: 500 });
  }
  await revokeUserSessions(row.userId);
  await logAudit({
    actorEmail: row.user.email,
    action: "password.reset.completed",
    propertyId: row.user.propertyId,
    ip,
  });
  const res = NextResponse.json({ ok: true, relogin: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
