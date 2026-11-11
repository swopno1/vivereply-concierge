// 2FA setup-confirm (session-authed): completes setup on a correct
// code from the app. Sets enabledAt, mints 10 recovery codes, and
// returns them IN PLAINTEXT EXACTLY ONCE — the client shows them with
// a "save these now" instruction and never fetches them again (only
// hashes live in the DB). Enable + codes land atomically: a failure
// anywhere leaves setup pending and retry-safe (no half-enabled
// account, no live codes the user never saw). Throttled like login.
// SERVICE PATH (marked): auth-lifecycle writes by verified session.
import { NextRequest, NextResponse } from "next/server";
import { prismaService } from "@/lib/prisma";
import { THROTTLE_WINDOW_MIN, throttleDecision } from "@/lib/auth";
import { getSession, sessionOwnerVerified } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { decryptSecret } from "@/lib/secrets";
import { base32Decode, verifyTotp } from "@/lib/totp";
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/two-factor";

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
  const code = typeof body?.code === "string" ? body.code : "";
  const ip = clientIp(req);
  if (!code.trim()) {
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
  if (!user || !user.active || !user.totpSecretEnc) {
    return NextResponse.json({ error: "No setup in progress. Start again." }, { status: 400 });
  }
  if (user.totpEnabledAt) {
    return NextResponse.json({ error: "Two-factor authentication is already enabled." }, { status: 409 });
  }
  let secret: Buffer;
  try {
    secret = base32Decode(decryptSecret(user.totpSecretEnc));
  } catch {
    return NextResponse.json({ error: "Invalid code. Try again." }, { status: 401 });
  }
  if (!verifyTotp(secret, code)) {
    await prismaService().loginAttempt
      .create({ data: { email: session.email || "(bootstrap)", ip, ok: false } })
      .catch(() => null);
    return NextResponse.json({ error: "Invalid code. Try again." }, { status: 401 });
  }

  const codes = generateRecoveryCodes();
  const hashed: string[] = [];
  for (const c of codes) hashed.push(await hashRecoveryCode(c));
  try {
    await prismaService().$transaction([
      // Supersede any older unused set (re-setup after disable wipes
      // first, so normally empty — belt and braces against stacked sets).
      prismaService().recoveryCode.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prismaService().recoveryCode.createMany({
        data: hashed.map((codeHash) => ({ userId: user.id, codeHash })),
      }),
      prismaService().user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } }),
    ]);
  } catch {
    return NextResponse.json({ error: "Setup failed. Try again." }, { status: 500 });
  }
  await logAudit({
    actorEmail: user.email,
    action: "2fa.enabled",
    propertyId: user.propertyId,
    ip,
  });
  return NextResponse.json({ ok: true, recoveryCodes: codes });
}
