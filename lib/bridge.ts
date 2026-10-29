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
import { verifyEmbedToken } from "./auth";

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
  // Tenant kill-switch: a suspended property's keys stop working on next
  // use. Dynamic import: lib/tenant pulls next/headers, which must stay
  // out of this module's top level so the pure functions stay importable
  // without a Next runtime.
  const { isPropertyActive } = await import("@/lib/tenant");
  if (!(await isPropertyActive(row.propertyId))) return null;
  return { tokenId: row.id, propertyId: row.propertyId };
}

// --- Staff embed (P3) ----------------------------------------------------
// The iframe widget authorizes with a short-lived embed token instead of a
// bridge key (the key must never reach a browser). verifyBridgeRequest
// accepts EITHER credential on the handoff endpoints — same property
// scoping, same 404 rules — and reports which one came in. The mint
// endpoint itself takes bridge keys ONLY (no token chaining).

export type BridgeRequestAuth = BridgeAuth & { via: "key" | "embed" };

export async function verifyBridgeRequest(header: string | null): Promise<BridgeRequestAuth | null> {
  const keyAuth = await verifyBridgeKey(header);
  if (keyAuth) return { ...keyAuth, via: "key" };
  const embed = verifyEmbedToken(bearerToken(header));
  if (!embed) return null;
  // Same kill-switch as keys: embed tokens verify on every call, so a
  // suspended property's dashboards go dark immediately — no 15-minute
  // tail (the tail was the old documented behavior; this closes it).
  const { isPropertyActive } = await import("@/lib/tenant");
  if (!(await isPropertyActive(embed.propertyId))) return null;
  return { tokenId: "embed", propertyId: embed.propertyId, via: "embed" };
}

// Mint-time origin validation: a full web origin (scheme + host + optional
// port), https only — http survives solely for loopback in development, so
// a dashboard can be built locally. Returns the normalized origin bound
// into the token, or null when the input is not an acceptable origin.
export function cleanEmbedOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 253) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase();
  if (!host) return null;
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (url.protocol === "https:") {
    return `https://${host}${url.port ? `:${url.port}` : ""}`;
  }
  if (url.protocol === "http:" && isLoopback && process.env.NODE_ENV !== "production") {
    return `http://${host}${url.port ? `:${url.port}` : ""}`;
  }
  return null;
}

// Iframe-load origin binding: the browser's Referer for the iframe document
// request must equal the origin bound into the token. Missing, unparseable,
// or mismatched referers fail CLOSED — a dashboard that strips referrers
// cannot host the widget (documented in bridge-integration.md). There is no
// "allow missing" fallback: one would void the binding for stolen tokens.
export function refererMatchesOrigin(referer: string | null, boundOrigin: string): boolean {
  if (!referer || !boundOrigin) return false;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (!host) return false;
  const origin = `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`;
  return origin === boundOrigin;
}
