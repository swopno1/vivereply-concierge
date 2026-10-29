// Verification resend API (session required — logged-out resend would let
// anyone email-bomb arbitrary addresses).
//   POST /api/auth/verify/resend -> { ok: true, emailSent }
// Owner-only, and a no-op lie when already verified (indistinguishable
// response either way). Rate limit: 3 sends per user per hour, counted
// from token rows (no extra table). Resending invalidates older unused
// tokens so only the newest link works.

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { getSession } from "@/lib/tenant";

const RESEND_WINDOW_MS = 3600 * 1000;
const RESEND_MAX_PER_WINDOW = 3;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.uid === "bootstrap") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const user = await prisma.user
    .findUnique({ where: { id: session.uid }, select: { email: true, active: true, emailVerifiedAt: true } })
    .catch(() => null);
  if (!user || !user.active) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, emailSent: false });
  }
  const since = new Date(Date.now() - RESEND_WINDOW_MS);
  const recent = await prisma.emailVerificationToken
    .count({ where: { userId: session.uid, createdAt: { gt: since } } })
    .catch(() => 0);
  if (recent >= RESEND_MAX_PER_WINDOW) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await prisma.emailVerificationToken
    .deleteMany({ where: { userId: session.uid, usedAt: null } })
    .catch(() => null);
  await prisma.emailVerificationToken
    .create({ data: { tokenHash, userId: session.uid, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) } })
    .catch(() => null);
  const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const link = `${origin.replace(/\/$/, "")}/verify-email?token=${rawToken}`;
  try {
    await sendVerificationEmail(user.email, link);
  } catch {
    return NextResponse.json({ ok: true, emailSent: false });
  }
  return NextResponse.json({ ok: true, emailSent: true });
}
