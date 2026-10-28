// Session + chat tokens (step 4.5, multi-tenant core). No new
// dependencies: everything here uses Node's built-in crypto
// (HMAC-SHA256 for tokens, scrypt for passwords).
//
// Two different tokens, do not confuse them:
//   - Session: proves a browser passed /login. Stored as an HttpOnly
//     cookie, checked server-side by /staff, /admin, /settings,
//     /onboarding, and /api/admin/*. Two roles: SUPER_ADMIN (the
//     founder — ADMIN_EMAIL + ADMIN_PASSWORD env, checked first, or a
//     User row) and OWNER (one property, email + scrypt password from
//     registration). There is no signup, no password reset-by-email, no
//     2FA — recovery is changing the env vars (bootstrap) or the admin
//     revoke (user rows). That is the honest bar, stated in the README.
//   - Chat token: proves a chat request is allowed. Issued either
//     server-side for a direct visit to / (scope "direct"), or by the
//     widget handshake for an approved domain (scope "widget").
//     /api/chat trusts ONLY the token's propertyId — never a
//     propertyId the browser sends. A widget token also carries its
//     domain, and /api/chat re-checks that domain against the
//     approved list on every message, so deactivating a domain in
//     Settings kills its widgets on the next message, not just on new
//     embeds.
//
// SESSION_SECRET: if unset in development, a dev-only fallback is
// used so local work still runs (with a console warning). In
// production (NODE_ENV=production, which Vercel sets automatically)
// an unset secret means tokens cannot be created or verified — the
// app fails closed rather than signing tokens with a known secret.

import { createHmac, createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "concierge_session";
const CHAT_TOKEN_HOURS = 24;
const EMBED_TOKEN_MINUTES = 15;

// Auth Tier 1 knobs (exported for lib/tenant.ts + routes + probes).
export const SESSION_ABSOLUTE_DAYS = 7;
export const SESSION_IDLE_HOURS = 24;
export const MIN_PASSWORD_LEN = 12;
export const THROTTLE_WINDOW_MIN = 15;
export const THROTTLE_MAX_EMAIL_FAILS = 5;
export const THROTTLE_MAX_IP_FAILS = 20;

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

// Founder bootstrap identity: login as super-admin needs BOTH this email
// and ADMIN_PASSWORD. Unset or empty ADMIN_EMAIL disables the bootstrap
// entirely (fail closed — a User-row super-admin still works). Never reuse
// this email for a User row: the bootstrap check runs first, so the row
// would be shadowed (recovery stays unconditional, by design).
export function isBootstrapEmail(email: string): boolean {
  const admin = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!admin) return false;
  return email.toLowerCase().trim() === admin;
}

// --- Owner passwords (scrypt, no new deps) -------------------------------
// Format: scrypt$1$<salt-hex>$<hash-hex> (N=16384, r=8, p=1, 32 bytes).
// Hashing lives here and in prisma/seed-tenants.mjs (plain-JS twin with the
// same parameters — no tsx needed to seed; change both together).
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 32 } as const;

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_PARAMS.keyLen, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p }, (err, key) =>
      err ? reject(err) : resolve(key as Buffer)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptKey(password, salt);
  return `scrypt$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, ver, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || ver !== "1" || !saltHex || !hashHex) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== SCRYPT_PARAMS.keyLen) return false;
  let actual: Buffer;
  try {
    actual = await scryptKey(password, salt);
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

// A valid-format hash of a password nobody knows, for the login timing
// path: unknown emails still pay one scrypt, so enumeration by timing
// buys nothing. Useless to an attacker — it verifies nothing real.
export const DUMMY_PASSWORD_HASH =
  "scrypt$1$a81e47d152cf4764e8e651fffc7a9547$f8b778f0a1c7c165bd2f27573b286ba90656874c526d8bdfd089d30884f70621";

// --- Session (v2 + sid allowlist, auth Tier 1) ------------------------------
// The cookie carries a signed payload (fast gating) PLUS a server-minted
// session id. A session is live only while its Session row exists,
// unrevoked, unexpired, and within the idle window (checked in
// lib/tenant.ts) — logout, password change, and admin revoke all act
// there. Session ids are server-minted only, so fixation is impossible by
// construction; each login mints a fresh row (multi-device allowed).
// Tokens without a sid (pre-Tier-1) are rejected — this deploy logs
// everyone out exactly once.

export type SessionRole = "SUPER_ADMIN" | "OWNER";

export type Session = {
  sid: string;
  uid: string;
  email: string | null;
  role: SessionRole;
  propertyId: string | null;
};

type SessionPayload = { v: number; sid: string; uid: string; email: string | null; role: string; propertyId: string | null; exp: number };

export function createSessionToken(session: Session): string | null {
  if (!session.sid) return null;
  return encodeToken({
    v: 2,
    sid: session.sid,
    uid: session.uid,
    email: session.email,
    role: session.role,
    propertyId: session.propertyId,
    exp: Math.floor(Date.now() / 1000) + SESSION_ABSOLUTE_DAYS * 24 * 3600,
  });
}

export function verifySessionToken(token: string | null | undefined): Session | null {
  if (!token) return null;
  const payload = decodeToken<SessionPayload>(token);
  if (!payload || payload.v !== 2) return null;
  if (!payload.sid) return null;
  if (!payload.uid || (payload.role !== "SUPER_ADMIN" && payload.role !== "OWNER")) return null;
  if (payload.role === "OWNER" && !payload.propertyId) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return { sid: payload.sid, uid: payload.uid, email: payload.email ?? null, role: payload.role, propertyId: payload.propertyId };
}

// --- Tier 1 helpers (pure, probed) ----------------------------------------

// Temporary passwords (admin-issued, shown once): 16 readability-safe chars.
export function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

// Throttle decision from recent-failure counts (window enforced by the
// caller counting rows newer than THROTTLE_WINDOW_MIN). Either dimension
// trips the block — per-email stops targeted guessing, per-IP stops spray.
export function throttleDecision(emailFails: number, ipFails: number): boolean {
  return emailFails >= THROTTLE_MAX_EMAIL_FAILS || ipFails >= THROTTLE_MAX_IP_FAILS;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: unknown, maxLen = 100): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLen && SLUG_RE.test(value);
}

export function isValidEmail(value: unknown, maxLen = 150): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLen) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

// --- Staff embed token -------------------------------------------------
// Short-lived (15 min), single-purpose: authorizes the staff iframe widget
// (/staff/embed) for ONE property from ONE dashboard origin. Minted
// server-side by the client dashboard through POST /api/bridge/embed-tokens
// (bridge-key auth — embed tokens can never mint more tokens). The origin
// binding is enforced at iframe load (Referer check); the 15-minute expiry
// bounds a stolen token's window. kind:"embed" separates these from chat
// tokens — neither verifies as the other (probed).

export type EmbedToken = {
  v: number;
  kind: "embed";
  propertyId: string;
  origin: string;
  exp: number;
};

export function createEmbedToken(args: { propertyId: string; origin: string }): string | null {
  return encodeToken({
    v: 1,
    kind: "embed",
    propertyId: args.propertyId,
    origin: args.origin,
    exp: Math.floor(Date.now() / 1000) + EMBED_TOKEN_MINUTES * 60,
  });
}

export function verifyEmbedToken(token: string | null | undefined): EmbedToken | null {
  if (!token) return null;
  const payload = decodeToken<EmbedToken>(token);
  if (!payload || payload.v !== 1 || payload.kind !== "embed") return null;
  if (!payload.propertyId || !payload.origin) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}
