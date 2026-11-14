// 2FA verify API (second login step).
//   POST /api/auth/login/verify { challengeToken, code? | recoveryCode? }
//     -> { ok: true, role, propertyId } + session cookie
// Redeems the short-lived challenge the login route issues after a
// correct password on a TOTP-enabled account. Exactly one of code /
// recoveryCode is required. Wrong code → generic error (the caller
// already proved the password to hold a challenge, so code-specific
// wording leaks nothing new). Recovery codes claim atomically
// (single-use even under concurrent replay). Success mints the full
// session — bootstrap challenges mint bootstrap sessions (uid
// "bootstrap", userId null), exactly like the password-only path.
// SERVICE PATH (marked): auth bootstrap. Attempts share the login
// throttle budget (throttle first, log every attempt like login).
import { NextRequest, NextResponse } from "next/server";
// SERVICE PATH (marked): auth bootstrap runs before any tenant exists — bypass client by design.
import { prismaService } from "@/lib/prisma";
import {
  THROTTLE_WINDOW_MIN,
  setSessionCookie,
  throttleDecision,
  verifyTwoFactorChallengeToken,
} from "@/lib/auth";
import { mintLoginSession } from "@/lib/tenant";
import { preferredOwnerProperty } from "@/lib/dashboard";
import { logAudit } from "@/lib/audit";
import { verifyAndClaimRecoveryCode, verifyUserTotp } from "@/lib/two-factor";

function clientIp(req: NextRequest): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (first || "unknown").slice(0, 80);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const challengeToken = typeof body?.challengeToken === "string" ? body.challengeToken : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const recoveryCode = typeof body?.recoveryCode === "string" ? body.recoveryCode : "";
  const ip = clientIp(req);

  const challenge = verifyTwoFactorChallengeToken(challengeToken);
  if (!challenge) {
    return NextResponse.json(
      { error: "Authentication expired. Please log in again." },
      { status: 401 }
    );
  }
  if ((code ? 1 : 0) + (recoveryCode ? 1 : 0) !== 1) {
    return NextResponse.json({ error: "A code is required." }, { status: 400 });
  }

  const since = new Date(Date.now() - THROTTLE_WINDOW_MIN * 60 * 1000);
  const counts = await Promise.all([
    prismaService().loginAttempt.count({
      where: { email: challenge.email || "(bootstrap)", ok: false, createdAt: { gt: since } },
    }),
    prismaService().loginAttempt.count({ where: { ip, ok: false, createdAt: { gt: since } } }),
  ]).catch(() => [0, 0] as [number, number]);
  if (throttleDecision(counts[0], counts[1])) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const fail = async (throttledMessage: string, status: number, logAsRecovery: boolean) => {
    await prismaService().loginAttempt
      .create({ data: { email: challenge.email || "(bootstrap)", ip, ok: false } })
      .catch(() => null);
    await logAudit({
      actorEmail: challenge.email,
      action: logAsRecovery ? "login.2fa.recovery.failed" : "login.2fa.failed",
      ip,
    });
    return NextResponse.json({ error: throttledMessage }, { status });
  };

  const user = await prismaService().user
    .findUnique({
      where: { id: challenge.uid },
      select: {
        id: true,
        email: true,
        role: true,
        propertyId: true,
        lastPropertyId: true,
        active: true,
        totpSecretEnc: true,
        totpEnabledAt: true,
      },
    })
    .catch(() => null);
  // Fail closed on anything unexpected: missing/inactive user, 2FA
  // disabled after the challenge was issued, email drift. All answer
  // as a bad code — the caller learns nothing about account state.
  if (!user || !user.active || !user.totpSecretEnc || !user.totpEnabledAt) {
    return fail("Invalid code. Try again.", 401, false);
  }
  // Closed role set, mirroring login: any other role string (or an
  // OWNER without a property) fails closed rather than minting a
  // session the rest of the app cannot reason about.
  if (
    (user.role !== "OWNER" && user.role !== "SUPER_ADMIN") ||
    (user.role === "OWNER" && !user.propertyId)
  ) {
    return fail("Invalid code. Try again.", 401, false);
  }
  if (recoveryCode) {
    const claimed = await verifyAndClaimRecoveryCode(user.id, recoveryCode);
    if (!claimed) {
      return fail("Invalid recovery code.", 401, true);
    }
    await logAudit({
      actorEmail: user.email,
      action: "2fa.recovery.used",
      propertyId: user.propertyId,
      ip,
    });
  } else if (!(await verifyUserTotp({ totpSecretEnc: user.totpSecretEnc, totpEnabledAt: user.totpEnabledAt, code }))) {
    return fail("Invalid code. Try again.", 401, false);
  }

  await prismaService().loginAttempt
    .create({ data: { email: challenge.email || "(bootstrap)", ip, ok: true } })
    .catch(() => null);
  // Bootstrap keeps its exact password-only session shape (uid
  // "bootstrap", null user row link); row users mint from the fresh row.
  // D1: owners reopen the switcher's last property when still valid.
  const minted = challenge.bootstrap
    ? await mintLoginSession({
        session: { uid: "bootstrap", email: user.email, role: "SUPER_ADMIN", propertyId: null },
        userId: null,
        ip,
      })
    : await mintLoginSession({
        session: {
          uid: user.id,
          email: user.email,
          role: user.role as "OWNER" | "SUPER_ADMIN",
          propertyId:
            user.role === "OWNER" && user.propertyId
              ? await preferredOwnerProperty({ email: user.email, propertyId: user.propertyId, lastPropertyId: user.lastPropertyId ?? null })
              : user.propertyId,
        },
        userId: user.id,
        ip,
      });
  if (!minted) {
    return NextResponse.json({ error: "Login is unavailable right now." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true, role: minted.role, propertyId: minted.propertyId });
  setSessionCookie(res, minted.token);
  return res;
}
