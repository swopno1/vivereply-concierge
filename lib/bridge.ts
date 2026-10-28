// Server-to-server bridge credentials (staff handoff API for client
// dashboards). Industry-standard PAT shape: the token is
// `cb.<prefix>.<secret>` — dots, because the base64url secret itself can
// contain underscores. The database stores the prefix (lookup key) plus
// the secret's SHA-256 hash — never the secret itself. Every bridge
// request re-reads the token row, so revoking kills the key on its next
// call. Comparison is timing-safe. Pure functions (mint, parse, hash)
// are separated from the Prisma lookup so the crypto can be probed
// without a database.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type MintedToken = {
  token: string;
  prefix: string;
  secretHash: string;
};

export function mintBridgeToken(): MintedToken {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return { token: `cb.${prefix}.${secret}`, prefix, secretHash: hashBridgeSecret(secret) };
}

export function hashBridgeSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function parseBridgeToken(token: string): { prefix: string; secret: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "cb") return null;
  const [, prefix, secret] = parts;
  if (!prefix || !secret || prefix.length > 64 || secret.length > 128) return null;
  return { prefix, secret };
}

export type BridgeAuth = {
  tokenId: string;
  propertyId: string;
};

// The only handoff statuses the bridge accepts. Anything else is a 400,
// never stored — the chat agent only ever writes OPEN.
export const BRIDGE_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
export type BridgeStatus = (typeof BRIDGE_STATUSES)[number];

export function isBridgeStatus(value: unknown): value is BridgeStatus {
  return typeof value === "string" && (BRIDGE_STATUSES as readonly string[]).includes(value);
}

export function bearerToken(header: string | null): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token ? token : null;
}

export async function verifyBridgeKey(header: string | null): Promise<BridgeAuth | null> {
  const token = bearerToken(header);
  if (!token) return null;
  const parsed = parseBridgeToken(token);
  if (!parsed) return null;
  const row = await prisma.bridgeToken.findUnique({ where: { prefix: parsed.prefix } });
  if (!row || !row.active) return null;
  const presented = Buffer.from(hashBridgeSecret(parsed.secret));
  const expected = Buffer.from(row.secretHash);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return null;
  }
  return { tokenId: row.id, propertyId: row.propertyId };
}
