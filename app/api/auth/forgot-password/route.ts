// Public forgot-password API (Phase 0).
//   POST /api/auth/forgot-password { email } -> { ok: true } ALWAYS
// Known active User row: mint a 1h single-use reset token (invalidating
// older unused ones for the user), email the /reset-password?token=
// link. Unknown, inactive, or bootstrap email: identical { ok: true },
// nothing sent — the response is not an account-enumeration oracle.
// Abuse shape (mirrors verify/resend + login conventions):
//   - per-IP: 5 req/min via the shared IP bucket table (disjoint
//     "forgotpw:" keys); trips answer 429 + Retry-After (IP-keyed,
//     so no email-existence leak).
//   - per-email: max 3 sends/hour counted from token rows; over-cap is
//     a silent no-op lie ({ ok: true }, nothing sent, older links left
//     alone) — a 429 here WOULD leak existence (unknown emails never
//     trip it). The cap is counted, not invalidated, so an attacker
//     cannot burn a victim's live link by spamming requests.
//   - malformed email: 400 (format check, no DB, no leak).
// Email-send failures also answer { ok: true } (logged server-side).

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
// SERVICE PATH (marked): auth bootstrap runs before any tenant exists — bypass client by design (see Phase 1 PR service-path list).
import { prismaService } from "@/lib/prisma";
import { isValidEmail } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkForgotPasswordRateByIp } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";

// Reset links live 1 hour (stated in the emailed copy). Shorter than
// verification links (24h) because a reset link IS account access.
const RESET_TOKEN_TTL_MS = 3600 * 1000;
const RESET_SEND_WINDOW_MS = 3600 * 1000;
const RESET_MAX_SENDS_PER_WINDOW = 3;

function clientIp(req: NextRequest): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (first || "unknown").slice(0, 80);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const ip = clientIp(req);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  const ipDecision = await checkForgotPasswordRateByIp(ip);
  if (!ipDecision.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(ipDecision.retryAfterSec) } }
    );
  }
  // Unknown, inactive, or bootstrap (env-password, no User row): same
  // answer, nothing sent. Bootstrap recovery stays what it always was —
  // changing the deployment env vars, never email.
  const user = await prismaService().user
    .findUnique({ where: { email }, select: { id: true, active: true, propertyId: true } })
    .catch(() => null);
  if (!user || !user.active) {
    await logAudit({ actorEmail: email, action: "password.reset.requested", ip, detail: { sent: false } });
    return NextResponse.json({ ok: true });
  }
  const since = new Date(Date.now() - RESET_SEND_WINDOW_MS);
  const recent = await prismaService().passwordResetToken
    .count({ where: { userId: user.id, createdAt: { gt: since } } })
    .catch(() => 0);
  if (recent >= RESET_MAX_SENDS_PER_WINDOW) {
    await logAudit({
      actorEmail: email,
      action: "password.reset.requested",
      propertyId: user.propertyId,
      ip,
      detail: { sent: false, capped: true },
    });
    return NextResponse.json({ ok: true });
  }
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await prismaService().passwordResetToken
    .deleteMany({ where: { userId: user.id, usedAt: null } })
    .catch(() => null);
  await prismaService().passwordResetToken
    .create({ data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) } })
    .catch(() => null);
  const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const link = `${origin.replace(/\/$/, "")}/reset-password?token=${rawToken}`;
  try {
    await sendPasswordResetEmail(email, link);
  } catch (e) {
    console.error("forgot-password email failed:", e instanceof Error ? e.message : e);
    await logAudit({
      actorEmail: email,
      action: "password.reset.requested",
      propertyId: user.propertyId,
      ip,
      detail: { sent: false, emailError: true },
    });
    return NextResponse.json({ ok: true });
  }
  await logAudit({
    actorEmail: email,
    action: "password.reset.requested",
    propertyId: user.propertyId,
    ip,
    detail: { sent: true },
  });
  return NextResponse.json({ ok: true });
}
