// TOTP (RFC 6238, SHA-1, 30s step, 6 digits) for 2FA — hand-rolled on
// node:crypto, no dependency (same call as the scrypt passwords:
// small, auditable, RFC-vector-tested). Secrets are 20 random bytes,
// displayed/transferred as RFC 4648 base32 (what otpauth:// URLs and
// authenticator apps expect). Verification accepts the adjacent steps
// (±1) for clock skew and compares in constant time.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW_STEPS = 1;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): Buffer {
  return randomBytes(bytes);
}

export function base32Encode(buf: Buffer): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// Renders the secret the way authenticator apps show manual keys:
// uppercase base32 in groups of 4 (spacing is cosmetic — verify
// strips it back out).
export function formatManualKey(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, "$1 ").trim();
}

export function totpAuthUrl(args: { issuer: string; account: string; secretBase32: string }): string {
  const label = `${encodeURIComponent(args.issuer)}:${encodeURIComponent(args.account)}`;
  const params = new URLSearchParams({
    secret: args.secretBase32,
    issuer: args.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function totpAt(
  secret: Buffer,
  timeMs: number,
  stepSeconds = TOTP_STEP_SECONDS,
  digits = TOTP_DIGITS
): string {
  const counter = Math.floor(Math.floor(timeMs / 1000) / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    10 ** digits;
  return String(code).padStart(digits, "0");
}

export function verifyTotp(
  secret: Buffer,
  code: string,
  timeMs = Date.now(),
  windowSteps = TOTP_WINDOW_STEPS
): boolean {
  const clean = code.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(clean) || clean.length !== TOTP_DIGITS) return false;
  const candidate = Buffer.from(clean);
  for (let step = -windowSteps; step <= windowSteps; step += 1) {
    const expected = Buffer.from(totpAt(secret, timeMs + step * TOTP_STEP_SECONDS * 1000));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}
