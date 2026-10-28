// Reversible secret storage for Suite binding keys (adapter Phase 2).
// Binding secrets must be SENT to backends, so unlike bridge keys they
// cannot be hashed — AES-256-GCM with a key derived from BINDING_SECRET_KEY
// (founder-held env, ≥32 chars; Vercel + local .env). Wire format:
// base64url(iv).base64url(ciphertext).base64url(authTag). Missing or short
// env fails closed: encrypt and decrypt both throw, so a misconfigured
// deploy cannot silently store or send garbage. Pure (no Prisma import),
// so it probes without a database.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const env = process.env.BINDING_SECRET_KEY;
  if (!env || env.length < 32) {
    throw new Error("BINDING_SECRET_KEY is not set (random string, at least 32 characters)");
  }
  return createHash("sha256").update(env).digest();
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error("Nothing to encrypt.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptSecret(wire: string): string {
  const parts = wire.split(".");
  if (parts.length !== 3) throw new Error("Secret is corrupted or from another key.");
  const [ivB64, ctB64, tagB64] = parts as [string, string, string];
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Secret is corrupted or from another key.");
  }
}
