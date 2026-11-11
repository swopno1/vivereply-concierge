// 2FA disable (session-authed): requires the account password PLUS a
// current TOTP code (or a recovery code). Deletes the stored secret
// and ALL recovery codes (used and unused — a disabled account keeps
// no second-factor residue; re-setup mints a fresh set). The session
// stays alive: the caller just proved both factors, so no logout.
// SERVICE PATH (marked): auth-lifecycle writes by verified session.
import { NextRequest, NextResponse } from "next/server";
import { prismaService } from "@/lib/prisma";
import { THROTTLE_WINDOW_MIN, isBootstrapEmail, throttleDecision, verifyAdminPassword, verifyPassword } from "@/lib/auth";
import { getSession, sessionOwnerVerified } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { verifyAndClaimRecoveryCode, verifyUserTotp } from "@/lib/two-factor";

function clientIp(req: NextRequest): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (first || "unknown").slice(0, 80);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json(
      { error: "Verify your email to manage two-factor authentication." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const recoveryCode = typeof body?.recoveryCode === "string" ? body.recoveryCode : "";
  const ip = clientIp(req);
  if (!password) {
    return NextResponse.json({ error: "The current password is required." }, { status: 400 });
  }
  if ((code ? 1 : 0) + (recoveryCode ? 1 : 0) !== 1) {
    return NextResponse.json({ error: "A code is required." }, { status: 400 });
  }

  const since = new Date(Date.now() - THROTTLE_WINDOW_MIN * 60 * 1000);
  const counts = await Promise.all([
    prismaService().loginAttempt.count({
      where: { email: session.email || "(bootstrap)", ok: false, createdAt: { gt: since } },
    }),
    prismaService().loginAttempt.count({ where: { ip, ok: false, createdAt: { gt: since } } }),
  ]).catch(() => [0, 0] as [number, number]);
  if (throttleDecision(counts[0], counts[1])) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const user =
    session.uid === "bootstrap" && session.email
      ? await prismaService().user.findUnique({ where: { email: session.email } }).catch(() => null)
      : await prismaService().user.findUnique({ where: { id: session.uid } }).catch(() => null);
  if (!user || !user.totpSecretEnc || !user.totpEnabledAt) {
    return NextResponse.json({ error: "Two-factor authentication is not enabled." }, { status: 400 });
  }

  const passwordOk =
    session.uid === "bootstrap" || isBootstrapEmail(user.email)
      ? await verifyAdminPassword(password)
      : await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "The current password is wrong." }, { status: 403 });
  }
  if (recoveryCode) {
    const claimed = await verifyAndClaimRecoveryCode(user.id, recoveryCode);
    if (!claimed) {
      return NextResponse.json({ error: "Invalid recovery code." }, { status: 401 });
    }
  } else if (
    !(await verifyUserTotp({ totpSecretEnc: user.totpSecretEnc, totpEnabledAt: user.totpEnabledAt, code }))
  ) {
    return NextResponse.json({ error: "Invalid code. Try again." }, { status: 401 });
  }

  await prismaService().recoveryCode.deleteMany({ where: { userId: user.id } }).catch(() => null);
  await prismaService().user
    .update({ where: { id: user.id }, data: { totpSecretEnc: null, totpEnabledAt: null } })
    .catch(() => null);
  await logAudit({
    actorEmail: user.email,
    action: "2fa.disabled",
    propertyId: user.propertyId,
    ip,
  });
  return NextResponse.json({ ok: true });
}
