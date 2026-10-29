// Login API (multi-tenant core, auth Tier 1). Two paths, one generic error:
//   - ADMIN_EMAIL + ADMIN_PASSWORD (env): the founder bootstrap — a
//     SUPER_ADMIN session, checked first so recovery is unconditional.
//     Unset ADMIN_EMAIL disables it (fail closed).
//   - email + password: a User row (OWNER, or a SUPER_ADMIN row).
//     Unknown emails still pay one scrypt (dummy hash), so enumeration by
//     timing buys nothing. An OWNER whose property is missing or inactive
//     fails closed. Any role string outside the two known ones fails closed.
// Tier 1: attempts are throttled per email + per IP (DB-backed, so it holds
// across instances); each login mints a fresh server-side Session row and
// the cookie carries its id (fixation impossible — ids are server-minted
// only). Throttled hits answer 429 and are NOT logged as failures (else the
// block would extend itself forever). Adaptive human check: at 3 recent
// failures for the email (below the throttle trip), a Turnstile token is
// required — the client shows the widget on the 403 needCaptcha answer.
// If Turnstile is unconfigured when demanded, login stays available and
// alarms (accounts must never lock on a missing key; signup, by contrast,
// fails closed).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  DUMMY_PASSWORD_HASH,
  THROTTLE_WINDOW_MIN,
  createSessionToken,
  isBootstrapEmail,
  throttleDecision,
  verifyAdminPassword,
  verifyPassword,
  type Session,
} from "@/lib/auth";
import { sessionExpiresAt } from "@/lib/tenant";
import { turnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";

function clientIp(req: NextRequest): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (first || "unknown").slice(0, 80);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const ip = clientIp(req);

  const since = new Date(Date.now() - THROTTLE_WINDOW_MIN * 60 * 1000);
  const counts = await Promise.all([
    prisma.loginAttempt.count({ where: { email: email || "(bootstrap)", ok: false, createdAt: { gt: since } } }),
    prisma.loginAttempt.count({ where: { ip, ok: false, createdAt: { gt: since } } }),
  ]).catch(() => [0, 0] as [number, number]);
  if (throttleDecision(counts[0], counts[1])) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }
  if (counts[0] >= 3) {
    if (!turnstileConfigured()) {
      console.error("LOGIN: failures demand a human check but Turnstile is unconfigured — allowing without it.");
    } else {
      const t = typeof body?.turnstileToken === "string" ? body.turnstileToken : "";
      if (!t || !(await verifyTurnstileToken(t, ip))) {
        return NextResponse.json(
          { error: "Please complete the human check.", needCaptcha: true },
          { status: 403 }
        );
      }
    }
  }

  let session: Omit<Session, "sid"> | null = null;
  let userId: string | null = null;
  // Bootstrap first: ADMIN_EMAIL + ADMIN_PASSWORD always recovers, even if
  // a User row exists for that address (never create one — it would shadow).
  if (email && isBootstrapEmail(email) && verifyAdminPassword(password)) {
    session = { uid: "bootstrap", email, role: "SUPER_ADMIN", propertyId: null };
  } else if (email) {
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
          userId = user.id;
        }
      } else if (user.role === "SUPER_ADMIN" && !user.propertyId) {
        session = { uid: user.id, email: user.email, role: "SUPER_ADMIN", propertyId: null };
        userId = user.id;
      }
    }
  }

  await prisma.loginAttempt
    .create({ data: { email: email || "(bootstrap)", ip, ok: session !== null } })
    .catch(() => null);

  if (!session) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  // Opportunistic pruning (best-effort): yesterday's attempts and dead
  // sessions never accumulate into a large table.
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: since } } }).catch(() => null);
  await prisma.session
    .deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: since } }] } })
    .catch(() => null);

  const row = await prisma.session
    .create({ data: { userId, role: session.role, expiresAt: sessionExpiresAt() } })
    .catch(() => null);
  if (!row) {
    return NextResponse.json({ error: "Login is unavailable right now." }, { status: 500 });
  }
  const token = createSessionToken({ ...session, sid: row.id });
  if (!token) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => null);
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
