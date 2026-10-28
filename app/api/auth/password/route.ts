// Password change API (auth Tier 1, session required).
//   PATCH /api/auth/password { current, next } -> { ok: true }
// The bootstrap (env-password) super-admin cannot change here — that
// password lives in the deployment environment, and the API says so.
// Success revokes ALL of the user's sessions including the current one
// and clears the cookie: the owner logs in again with the new password,
// and any forgotten device is signed out too. Minimum length is
// MIN_PASSWORD_LEN; the temporary-password flag clears on change.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, MIN_PASSWORD_LEN, hashPassword, verifyPassword } from "@/lib/auth";
import { getSession, revokeUserSessions } from "@/lib/tenant";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.uid } }).catch(() => null);
  if (!user || !user.active) {
    return NextResponse.json(
      { error: "The bootstrap password changes in the deployment environment, not here." },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => null);
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";
  if (!current || !next) {
    return NextResponse.json({ error: "Current and new passwords are required." }, { status: 400 });
  }
  if (next.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `The new password must be at least ${MIN_PASSWORD_LEN} characters.` },
      { status: 400 }
    );
  }
  if (!(await verifyPassword(current, user.passwordHash))) {
    return NextResponse.json({ error: "The current password is wrong." }, { status: 403 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await revokeUserSessions(user.id);
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
