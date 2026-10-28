// Login API (multi-tenant core). Two paths, one generic error:
//   - email + password: a seeded User row (OWNER, or a SUPER_ADMIN row).
//     Unknown emails still pay one scrypt (dummy hash), so enumeration by
//     timing buys nothing. An OWNER whose property is missing or inactive
//     fails closed. Any role string outside the two known ones fails closed.
//   - password only (empty email): the founder bootstrap — ADMIN_PASSWORD
//     env, SUPER_ADMIN session. A missing env always fails closed.
// A correct login sets the signed HttpOnly session cookie (v2: who +
// which property). There is no signup route; users come from the seed file.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  DUMMY_PASSWORD_HASH,
  createSessionToken,
  verifyAdminPassword,
  verifyPassword,
  type Session,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  let session: Session | null = null;
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
    const ok = await verifyPassword(
      password,
      user && user.active ? user.passwordHash : DUMMY_PASSWORD_HASH
    );
    if (user && user.active && ok) {
      if (user.role === "OWNER" && user.propertyId) {
        const prop = await prisma.property.findUnique({ where: { id: user.propertyId } }).catch(() => null);
        if (prop && prop.status === "ACTIVE") {
          session = { uid: user.id, email: user.email, role: "OWNER", propertyId: user.propertyId };
        }
      } else if (user.role === "SUPER_ADMIN" && !user.propertyId) {
        session = { uid: user.id, email: user.email, role: "SUPER_ADMIN", propertyId: null };
      }
    }
  } else if (verifyAdminPassword(password)) {
    session = { uid: "bootstrap", email: null, role: "SUPER_ADMIN", propertyId: null };
  }

  if (!session) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  const token = createSessionToken(session);
  if (!token) {
    return NextResponse.json({ error: "Login is not configured." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true, role: session.role, propertyId: session.propertyId });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
}
