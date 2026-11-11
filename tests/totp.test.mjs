import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  base32Decode,
  base32Encode,
  formatManualKey,
  totpAt,
  totpAuthUrl,
  verifyTotp,
} from "@/lib/totp";
import { verifyPassword } from "@/lib/auth";
import { encryptSecret } from "@/lib/secrets";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyUserTotp,
} from "@/lib/two-factor";

describe("totp (RFC 6238 vectors, SHA-1)", () => {
  // Appendix B, secret "12345678901234567890" (ASCII), 8 digits.
  const secret = Buffer.from("12345678901234567890", "ascii");
  const vectors = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [seconds, expected] of vectors) {
    it(`T=${seconds} -> ${expected}`, () => {
      assert.equal(totpAt(secret, seconds * 1000, 30, 8), expected);
    });
  }
  it("6-digit codes verify within the skew window only", () => {
    const now = 1234567890 * 1000;
    const code = totpAt(secret, now);
    assert.equal(code.length, 6);
    assert.equal(verifyTotp(secret, code, now), true);
    assert.equal(verifyTotp(secret, code, now + 29 * 1000), true);
    assert.equal(verifyTotp(secret, code, now + 31 * 1000), true); // adjacent step
    assert.equal(verifyTotp(secret, code, now + 61 * 1000), false); // two steps out
    assert.equal(verifyTotp(secret, "000000", now), false);
  });
  it("tolerates user spacing, rejects malformed codes", () => {
    const now = 1234567890 * 1000;
    const code = totpAt(secret, now);
    assert.equal(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now), true);
    assert.equal(verifyTotp(secret, "12345", now), false);
    assert.equal(verifyTotp(secret, "abcdef", now), false);
    assert.equal(verifyTotp(secret, "", now), false);
  });
});

describe("base32 + otpauth", () => {
  it("roundtrips secrets, manual key re-parses", () => {
    const raw = Buffer.from("hello-world-12345678");
    const encoded = base32Encode(raw);
    assert.deepEqual(base32Decode(encoded), raw);
    assert.deepEqual(base32Decode(formatManualKey(encoded)), raw);
    assert.deepEqual(base32Decode(`  ${encoded.toLowerCase()}  `), raw);
    assert.throws(() => base32Decode("!!!not-base32!!!"), /Invalid base32/);
  });
  it("builds a scannable otpauth URL (SHA1/6-digit/30s)", () => {
    const url = totpAuthUrl({ issuer: "Vivereply Concierge", account: "owner@resort.test", secretBase32: "JBSWY3DPEHPK3PXP" });
    assert.ok(url.startsWith("otpauth://totp/"));
    assert.ok(url.includes("secret=JBSWY3DPEHPK3PXP"));
    assert.ok(url.includes("algorithm=SHA1") && url.includes("digits=6") && url.includes("period=30"));
  });
});

describe("recovery codes (pure helpers, no DB)", () => {
  it("mints 10 unique XXXX-XXXX codes from the unambiguous alphabet", () => {
    const codes = generateRecoveryCodes();
    assert.equal(codes.length, RECOVERY_CODE_COUNT);
    assert.equal(new Set(codes).size, codes.length);
    for (const c of codes) {
      assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });
  it("normalizes case, dashes, and whitespace before hashing", () => {
    assert.equal(normalizeRecoveryCode("ab12-cd34"), "AB12CD34");
    assert.equal(normalizeRecoveryCode("  ab12 cd34 "), "AB12CD34");
    assert.equal(normalizeRecoveryCode("AB12CD34"), "AB12CD34");
  });
  it("hash round-trips through the password verifier (wrong code fails)", async () => {
    const hash = await hashRecoveryCode("ab12-cd34");
    assert.equal(await verifyPassword("AB12CD34", hash), true);
    assert.equal(await verifyPassword("AB12-CD34", hash), false); // un-normalized input never verifies
    assert.equal(await verifyPassword("WRONGCODE", hash), false);
  });
});

describe("verifyUserTotp (encrypted secret, no DB)", () => {
  // Test-only encryption key: the helper fails closed without one.
  process.env.BINDING_SECRET_KEY ??= "test-only-binding-key-32-chars-min!!";
  const secret = Buffer.from("12345678901234567890", "ascii");
  const enc = encryptSecret(base32Encode(secret));
  const now = 1234567890 * 1000;
  const good = totpAt(secret, now);

  it("accepts a current code (spacing tolerated), rejects a wrong one", async () => {
    assert.equal(await verifyUserTotp({ totpSecretEnc: enc, totpEnabledAt: new Date(now), code: good, timeMs: now }), true);
    assert.equal(await verifyUserTotp({ totpSecretEnc: enc, totpEnabledAt: new Date(now), code: `${good.slice(0, 3)} ${good.slice(3)}`, timeMs: now }), true);
    assert.equal(await verifyUserTotp({ totpSecretEnc: enc, totpEnabledAt: new Date(now), code: "000000", timeMs: now }), false);
  });
  it("fails closed: missing secret, never enabled, corrupt ciphertext", async () => {
    assert.equal(await verifyUserTotp({ totpSecretEnc: null, totpEnabledAt: new Date(now), code: good, timeMs: now }), false);
    assert.equal(await verifyUserTotp({ totpSecretEnc: enc, totpEnabledAt: null, code: good, timeMs: now }), false);
    assert.equal(await verifyUserTotp({ totpSecretEnc: "bogus.cipher.text", totpEnabledAt: new Date(now), code: good, timeMs: now }), false);
  });
});
