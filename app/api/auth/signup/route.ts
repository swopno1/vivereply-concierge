// Public signup API (self-serve registration).
//   POST /api/auth/signup { resortName, email, password, turnstileToken }
// Creates a Property (ACTIVE) + OWNER login (UNVERIFIED) + a 24h
// single-use verification token, emails the link, and logs the owner
// in immediately — but config surfaces (Settings, onboarding, owner
// admin APIs) stay locked until the email is proven.
// Spam defense, in order: input validation, per-email + per-IP
// throttling (DB-backed, same constants as login), then Turnstile
// (fail closed — a failed check refuses, never skips silently).
// Duplicate emails answer 409 ("already registered") — the standard
// signup trade-off: login stays generic against credential probing,
// but registration confirms an address the requester typed.

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  MIN_PASSWORD_LEN,
  THROTTLE_WINDOW_MIN,
  createSessionToken,
  hashPassword,
  isBootstrapEmail,
  isValidEmail,
  throttleDecision,
} from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { sessionExpiresAt } from "@/lib/tenant";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { logAudit } from "@/lib/audit";

function clientIp(req: NextRequest): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (first || "unknown").slice(0, 80);
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return slug || "resort";
}

async function uniquePropertyId(base: string): Promise<{ id: string; widgetKey: string } | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = randomBytes(3).toString("hex");
    const id = `${base}-${suffix}`;
    const widgetKey = `key-${base}-${suffix}`.slice(0, 60);
    const clash = await prisma.property
      .findFirst({ where: { OR: [{ id }, { widgetKey }] }, select: { id: true } })
      .catch(() => null);
    if (!clash) return { id, widgetKey };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const resortName = typeof body?.resortName === "string" ? body.resortName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const turnstileToken = typeof body?.turnstileToken === "string" ? body.turnstileToken : "";
  const ip = clientIp(req);

  if (!resortName || resortName.length > 100) {
    return NextResponse.json({ error: "Resort name is required (max 100 characters)." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LEN} characters.` },
      { status: 400 }
    );
  }

  const since = new Date(Date.now() - THROTTLE_WINDOW_MIN * 60 * 1000);
  const counts = await Promise.all([
    prisma.signupAttempt.count({ where: { email, ok: false, createdAt: { gt: since } } }),
    prisma.signupAttempt.count({ where: { ip, ok: false, createdAt: { gt: since } } }),
  ]).catch(() => [0, 0] as [number, number]);
  if (throttleDecision(counts[0], counts[1])) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const logAttempt = (ok: boolean) =>
    prisma.signupAttempt.create({ data: { email, ip, ok } }).catch(() => null);

  if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken, ip))) {
    await logAttempt(false);
    // Indistinguishable whether keys are unset or the check failed —
    // either way a human cannot be proven, and signup stays closed.
    return NextResponse.json({ error: "Please complete the human check." }, { status: 403 });
  }

  // Duplicate (or bootstrap) email: 409, no account, no session.
  const taken =
    isBootstrapEmail(email) ||
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }).catch(() => null));
  if (taken) {
    await logAttempt(false);
    return NextResponse.json({ error: "This email is already registered. Log in instead." }, { status: 409 });
  }

  const ids = await uniquePropertyId(slugify(resortName));
  if (!ids) {
    await logAttempt(false);
    return NextResponse.json({ error: "Registration is unavailable right now." }, { status: 500 });
  }
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const user = await prisma.$transaction(async (tx) => {
    await tx.property.create({ data: { id: ids.id, name: resortName, widgetKey: ids.widgetKey, status: "ACTIVE" } });
    const created = await tx.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "OWNER",
        propertyId: ids.id,
        active: true,
        mustChangePassword: false,
        emailVerifiedAt: null,
      },
    });
    await tx.emailVerificationToken.create({
      data: { tokenHash, userId: created.id, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
    });
    return created;
  }).catch(() => null);
  if (!user) {
    await logAttempt(false);
    return NextResponse.json({ error: "Registration is unavailable right now." }, { status: 500 });
  }

  const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const link = `${origin.replace(/\/$/, "")}/verify-email?token=${rawToken}`;
  let emailSent = true;
  try {
    await sendVerificationEmail(email, link);
  } catch {
    emailSent = false; // account stands; the owner resends from Settings
  }
  await logAttempt(true);
  await prisma.signupAttempt.deleteMany({ where: { createdAt: { lt: since } } }).catch(() => null);
  await logAudit({ actorEmail: email, action: "signup.success", propertyId: ids.id, detail: { resortName }, ip });

  const row = await prisma.session
    .create({ data: { userId: user.id, role: "OWNER", expiresAt: sessionExpiresAt() } })
    .catch(() => null);
  if (!row) {
    return NextResponse.json({ ok: true, propertyId: ids.id, emailSent });
  }
  const token = createSessionToken({
    uid: user.id,
    email: user.email,
    role: "OWNER",
    propertyId: ids.id,
    sid: row.id,
  });
  const res = NextResponse.json({ ok: true, propertyId: ids.id, emailSent });
  if (token) {
    res.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 3600,
    });
  }
  return res;
}
