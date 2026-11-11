// 2FA setup-init (session-authed): mints a pending TOTP secret and
// returns the otpauth URL + manual key for QR display. Nothing is
// enforced yet — setup completes only when setup-confirm verifies a
// code from the app (then enabledAt is set). Re-running overwrites
// any pending (unconfirmed) secret; an enabled account gets 409.
// Bootstrap (env admin, no User row): the row is created here from
// ADMIN_EMAIL (SUPER_ADMIN, verified-at-creation, UNUSABLE password
// hash — bootstrap keeps logging in via env, never via this row),
// and the secret lives on it like every other account.
// SERVICE PATH (marked): auth-lifecycle writes keyed by verified
// session uid. The plaintext secret + QR payload travel ONLY in this
// response — never stored, never logged.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prismaService } from "@/lib/prisma";
import { getSession, sessionOwnerVerified } from "@/lib/tenant";
import { encryptSecret } from "@/lib/secrets";
import { base32Encode, formatManualKey, generateTotpSecret, totpAuthUrl } from "@/lib/totp";

export async function POST() {
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
  const db = prismaService();
  // Resolve the row that will hold the secret. Bootstrap has no row
  // until now: create its SUPER_ADMIN row from ADMIN_EMAIL on first
  // setup (the §3.1 decision). Row users resolve to their own id.
  let targetUserId: string | null = null;
  if (session.uid === "bootstrap") {
    const adminEmail = session.email ?? "";
    if (!adminEmail) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    let row = await db.user.findUnique({ where: { email: adminEmail } }).catch(() => null);
    if (!row) {
      // The password hash is random hex, NOT a scrypt string —
      // verifyPassword rejects it always, so this row can never log
      // in by password; it exists only as the 2FA store. (Signup
      // rejects the bootstrap email, so no OWNER row can collide.)
      // A lost race (concurrent setup) falls through to re-read.
      row = await db.user
        .create({
          data: {
            email: adminEmail,
            passwordHash: randomBytes(32).toString("hex"),
            role: "SUPER_ADMIN",
            active: true,
            emailVerifiedAt: new Date(),
          },
        })
        .catch(() => null);
      if (!row) {
        row = await db.user.findUnique({ where: { email: adminEmail } }).catch(() => null);
      }
    }
    if (!row) {
      return NextResponse.json({ error: "Setup is unavailable right now." }, { status: 500 });
    }
    if (row.totpEnabledAt && row.totpSecretEnc) {
      return NextResponse.json({ error: "Two-factor authentication is already enabled." }, { status: 409 });
    }
    targetUserId = row.id;
  } else {
    const row = await db.user
      .findUnique({ where: { id: session.uid }, select: { totpEnabledAt: true, totpSecretEnc: true } })
      .catch(() => null);
    if (!row) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (row.totpEnabledAt && row.totpSecretEnc) {
      return NextResponse.json({ error: "Two-factor authentication is already enabled." }, { status: 409 });
    }
    targetUserId = session.uid;
  }
  const secretBytes = generateTotpSecret();
  const secretBase32 = base32Encode(secretBytes);
  try {
    await db.user.update({
      where: { id: targetUserId },
      data: { totpSecretEnc: encryptSecret(secretBase32), totpEnabledAt: null },
    });
  } catch {
    return NextResponse.json({ error: "Setup is unavailable right now." }, { status: 500 });
  }
  return NextResponse.json({
    otpauthUrl: totpAuthUrl({
      issuer: "Vivereply Concierge",
      account: session.email ?? "owner",
      secretBase32,
    }),
    manualKey: formatManualKey(secretBase32),
  });
}
