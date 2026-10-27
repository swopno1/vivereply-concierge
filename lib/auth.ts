// Admin session + chat tokens (step 4.5). No new dependencies:
// everything here uses Node's built-in crypto (HMAC-SHA256).
//
// Two different tokens, do not confuse them:
//   - Admin session: proves a browser passed the /login password.
//     Stored as an HttpOnly cookie, checked server-side by /staff,
//     /admin, and /api/admin/*. Single admin in v1: the password is
//     ADMIN_PASSWORD (Vercel env, never in the repo). There is no
//     signup, no password reset, no 2FA in v1 — recovery is changing
//     the env var. That is the honest demo bar, stated in the README.
//   - Chat token: proves a chat request is allowed. Issued either
//     server-side for a direct visit to / (scope "direct"), or by the
//     widget handshake for an approved domain (scope "widget").
//     /api/chat trusts ONLY the token's propertyId — never a
//     propertyId the browser sends. A widget token also carries its
//     domain, and /api/chat re-checks that domain against the
//     approved list on every message, so deactivating a domain in
//     /admin kills its widgets on the next message, not just on new
//     embeds.
//
// SESSION_SECRET: if unset in development, a dev-only fallback is
// used so local work still runs (with a console warning). In
// production (NODE_ENV=production, which Vercel sets automatically)
// an unset secret means tokens cannot be created or verified — the
// app fails closed rather than signing tokens with a known secret.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "concierge_session";
const SESSION_DAYS = 7;
const CHAT_TOKEN_HOURS = 24;

function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV !== "production") {
    console.warn("SESSION_SECRET is not set — using a dev-only fallback. Set it in production.");
    return "dev-only-session-secret-do-not-use-in-production";
  }
  return null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = sign(payload);
  if (!expected) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function encodeToken(payload: Record<string, unknown>): string | null {
  const body = b64url(JSON.stringify(payload));
  const signature = sign(body);
  if (!signature) return null;
  return `${body}.${signature}`;
}

function decodeToken<T>(token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  if (!verifySignature(body, signature)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// --- Admin password -------------------------------------------------

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !password) return false;
  const a = createHash("sha256").update(password).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// --- Admin session --------------------------------------------------

type SessionPayload = { v: number; exp: number };

export function createSessionToken(): string | null {
  return encodeToken({
    v: 1,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 3600,
  });
}

export function verifySessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const payload = decodeToken<SessionPayload>(token);
  if (!payload || payload.v !== 1) return false;
  return payload.exp > Math.floor(Date.now() / 1000);
}

// --- Chat token -----------------------------------------------------

export type ChatTokenScope = "direct" | "widget";

export type ChatToken = {
  v: number;
  propertyId: string;
  scope: ChatTokenScope;
  domain: string | null;
  exp: number;
};

export function createChatToken(args: {
  propertyId: string;
  scope: ChatTokenScope;
  domain?: string | null;
}): string | null {
  return encodeToken({
    v: 1,
    propertyId: args.propertyId,
    scope: args.scope,
    domain: args.domain ?? null,
    exp: Math.floor(Date.now() / 1000) + CHAT_TOKEN_HOURS * 3600,
  });
}

export function verifyChatToken(token: string | null | undefined): ChatToken | null {
  if (!token) return null;
  const payload = decodeToken<ChatToken>(token);
  if (!payload || payload.v !== 1) return null;
  if (!payload.propertyId || (payload.scope !== "direct" && payload.scope !== "widget")) {
    return null;
  }
  if (payload.scope === "widget" && !payload.domain) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}
