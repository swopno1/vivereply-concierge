// Second-factor verification (TOTP + recovery codes). SERVICE-INTERNAL:
// every function here runs on the bypass client — callers are the 2FA
// routes (verify, disable), never tenant paths. Recovery codes are
// scrypt-hashed like passwords (same cost profile, same helpers);
// claiming is atomic (updateMany on id+unused, count-checked) so a
// code truly works once even under concurrent use.

import { randomBytes } from "node:crypto";
import { prismaService } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { decryptSecret } from "@/lib/secrets";
import { base32Decode, verifyTotp } from "@/lib/totp";

export const RECOVERY_CODE_COUNT = 10;

// Crockford-style alphabet minus lookalikes (no 0/O/1/I/L): 8 chars
// ≈ 40 bits per code, scrypt-hashed at rest (offline brute force at
// ~10 guesses/sec is infeasible), online attempts throttled.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(8);
    let code = "";
    for (const byte of bytes) code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return hashPassword(normalizeRecoveryCode(code));
}

// Verifies a TOTP code against the user's stored (encrypted) secret.
// False on any failure: no secret, 2FA not enabled, bad code, corrupt
// ciphertext. Never throws for auth outcomes (only the DB call can,
// and callers catch it like every other service read).
export async function verifyUserTotp(args: {
  totpSecretEnc: string | null;
  totpEnabledAt: Date | null;
  code: string;
  timeMs?: number;
}): Promise<boolean> {
  if (!args.totpSecretEnc || !args.totpEnabledAt) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(decryptSecret(args.totpSecretEnc));
  } catch {
    return false;
  }
  return verifyTotp(secret, args.code, args.timeMs);
}

// Verifies a recovery code AND atomically claims it (single-use).
// Returns the claimed row id, or null when no unused code matches.
// The updateMany guard (id + usedAt null, count-checked) is what makes
// concurrent double-spend impossible — not the scrypt comparison.
export async function verifyAndClaimRecoveryCode(
  userId: string,
  code: string
): Promise<string | null> {
  const clean = normalizeRecoveryCode(code);
  if (!clean) return null;
  const rows = await prismaService().recoveryCode
    .findMany({ where: { userId, usedAt: null }, select: { id: true, codeHash: true } })
    .catch(() => []);
  for (const row of rows) {
    if (await verifyPassword(clean, row.codeHash).catch(() => false)) {
      const claimed = await prismaService().recoveryCode
        .updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
        .catch(() => null);
      if (claimed && claimed.count === 1) return row.id;
      return null;
    }
  }
  return null;
}
