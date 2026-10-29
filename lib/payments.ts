// Guest booking payments (suite users only, flag-gated OFF by default).
// The chatbot mints a PaymentLink for a held draft; the guest pays through
// the deep link /pay/[token] (standalone — no chat needed) via Stripe
// Checkout or manual instructions; Stripe webhooks (or staff, for manual)
// mark the row paid; the chatbot re-reads the row on "is it paid?".
//
// Security shape, enforced here:
// - Amounts come ONLY from the server-side draft snapshot, never the browser.
// - The token is 256 bits of randomness; invalid/expired tokens share one
//   generic page (no enumeration oracle beyond the token itself).
// - Stripe sees an idempotency key per link (double-clicks, retries, and
//   webhook redeliveries all collapse to one session / one paid marking).
// - Webhooks verify the Stripe signature with a timestamp tolerance.
// - No card data ever touches our servers (Stripe-hosted checkout) and the
//   /pay page shows the guest's first name only, never email or phone.

import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { fixtureRoomsFor } from "@/demo-config/fixture";
import type { PaymentLink } from "@prisma/client";

export type PaymentMethod = "stripe" | "manual";

export type DraftSnapshot = {
  bookingCode: string;
  room: string;
  checkIn: string;
  checkOut: string;
  suiteTotalPoisha: number;
  guestName: string;
  guestEmail: string;
};

// Global kill-switch. Anything payment-shaped — tools, prompt section,
// /pay page, checkout, webhooks, admin list — refuses unless this is on.
export function paymentsEnabledGlobal(): boolean {
  return process.env.PAYMENTS_ENABLED === "true";
}

// Suite-only rule: fixture properties (in-process demo backends, no real
// Suite behind them) never take payments, even with the flag on. Pure —
// no database hit — so every layer can enforce it cheaply.
export function propertyTakesPayments(propertyId: string): boolean {
  if (!paymentsEnabledGlobal()) return false;
  return !fixtureRoomsFor(propertyId);
}

// What the chatbot may offer when the guest asks "what do you accept?"
// Card needs a configured Stripe key; manual instructions always exist.
export function availableMethods(): PaymentMethod[] {
  const methods: PaymentMethod[] = [];
  if (process.env.STRIPE_SECRET_KEY) methods.push("stripe");
  methods.push("manual");
  return methods;
}

export function methodLabel(method: PaymentMethod): string {
  return method === "stripe" ? "card (Visa, Mastercard, Amex via Stripe)" : "manual transfer (bKash / bank, verified by staff)";
}

export function linkTtlHours(): number {
  const raw = Number(process.env.PAYMENT_LINK_TTL_HOURS ?? "24");
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 72) : 24;
}

// Guard-railed payment origin: the OPERATOR-configured canonical domain,
// never request headers (Host / x-forwarded-host are guest-controlled and
// must not shape a payment URL). Missing or non-https (in production)
// config fails minting closed — no link, no fallback, no guessing.
export function paymentOrigin(): string {
  const raw = (process.env.APP_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!raw) throw new Error("Payments are not configured for this resort.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Payments are not configured for this resort.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Payments are not configured for this resort.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Payments are not configured for this resort.");
  }
  return raw;
}

// Deep-link shape: /pay/[token]?booking=[code]. The booking code rides
// visibly in the URL (prefilled on the page, no typing) AND the /pay
// page refuses any token whose code does not match — the link is bound
// to exactly one booking, so a swapped or truncated URL fails closed.
export function paymentUrlFor(link: { token: string; bookingCode: string }, origin: string): string {
  return `${origin}/pay/${link.token}?booking=${encodeURIComponent(link.bookingCode)}`;
}

function firstNameOf(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full.trim();
}

// Mint (or reuse) a payment link for a held draft. Reuse rule: a pending,
// unexpired link for the same conversation + booking + method is returned
// as-is, so retries and re-asks never mint duplicate links.
export async function mintPaymentLink(args: {
  propertyId: string;
  conversationId: string;
  draft: DraftSnapshot;
  method: PaymentMethod;
}): Promise<PaymentLink> {
  const { propertyId, conversationId, draft, method } = args;
  if (!propertyTakesPayments(propertyId)) {
    throw new Error("Payments are not enabled for this property.");
  }
  // Domain guard-rail: the property must have a configured website
  // domain (owner Settings → Website domains). A Suite property with no
  // site of its own gets no payment links — the deep link always names
  // a domain the owner configured, never an arbitrary host.
  const domains = await prisma.approvedDomain.count({ where: { propertyId, active: true } });
  if (domains === 0) {
    throw new Error("The resort hasn't configured its website domain yet, so online payment is unavailable. Offer a handoff to staff.");
  }
  if (!availableMethods().includes(method)) {
    throw new Error(
      method === "stripe"
        ? "Card payment is not configured yet. Offer the manual transfer instead."
        : "Unknown payment method."
    );
  }
  const existing = await prisma.paymentLink.findFirst({
    where: {
      conversationId,
      bookingCode: draft.bookingCode,
      method,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return prisma.paymentLink.create({
    data: {
      propertyId,
      conversationId,
      bookingCode: draft.bookingCode,
      method,
      token: randomBytes(32).toString("hex"),
      amountPoisha: draft.suiteTotalPoisha,
      guestEmail: draft.guestEmail,
      guestFirstName: firstNameOf(draft.guestName),
      guestName: draft.guestName,
      room: draft.room,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      expiresAt: new Date(Date.now() + linkTtlHours() * 3600_000),
    },
  });
}

export type PaymentLinkView = {
  found: boolean;
  status: "pending" | "paid" | "expired" | "canceled";
  method: PaymentMethod | null;
  bookingCode: string | null;
  amountPoisha: number | null;
  paidAt: string | null;
  expiresAt: string | null;
  token: string | null;
};

// Lazy expiry: a pending link past its time is marked expired on read,
// so every reader (chat status, /pay page, admin list) agrees without a
// sweeper. Returns null only when the token never existed.
export async function getLinkByToken(token: string): Promise<PaymentLink | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const link = await prisma.paymentLink.findUnique({ where: { token } });
  if (!link) return null;
  if (link.status === "pending" && link.expiresAt.getTime() <= Date.now()) {
    return prisma.paymentLink.update({ where: { id: link.id }, data: { status: "expired" } });
  }
  return link;
}

// The chatbot's "is my payment done?" read: latest link for the booking
// held in this conversation. The tool output carries the full URL
// (server-built), never the raw token — the model repeats what it is
// given but can't rephrase or leak what it can't name.
export async function paymentStatusForConversation(
  conversationId: string,
  origin: string
): Promise<PaymentLinkView & { paymentUrl: string | null }> {
  const link = await prisma.paymentLink.findFirst({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
  });
  if (!link) {
    return {
      found: false,
      status: "pending",
      method: null,
      bookingCode: null,
      amountPoisha: null,
      paidAt: null,
      expiresAt: null,
      token: null,
      paymentUrl: null,
    };
  }
  const live =
    link.status === "pending" && link.expiresAt.getTime() <= Date.now()
      ? await prisma.paymentLink.update({ where: { id: link.id }, data: { status: "expired" } })
      : link;
  return {
    found: true,
    status: live.status as PaymentLinkView["status"],
    method: live.method as PaymentMethod,
    bookingCode: live.bookingCode,
    amountPoisha: live.amountPoisha,
    paidAt: live.paidAt?.toISOString() ?? null,
    expiresAt: live.expiresAt.toISOString(),
    token: live.token,
    paymentUrl: live.status === "pending" ? paymentUrlFor(live, origin) : null,
  };
}

// Stripe Checkout Session over plain HTTPS (no SDK — same style as
// lib/email.ts). Idempotency key = the link id: double-clicks and
// retries return the ORIGINAL session, never a second charge. Never
// sends payment_method_types (dynamic methods from the Dashboard).
export async function createStripeCheckoutSession(
  link: PaymentLink,
  origin: string
): Promise<{ url: string }> {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) throw new Error("Card payment is not configured.");
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": link.currency,
    "line_items[0][price_data][unit_amount]": String(link.amountPoisha),
    "line_items[0][price_data][product_data][name]": `Stay ${link.bookingCode} — ${link.room ?? "room"}`,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/pay/${link.token}?paid=1`,
    cancel_url: `${origin}/pay/${link.token}?canceled=1`,
    "metadata[paymentLinkId]": link.id,
    "metadata[bookingCode]": link.bookingCode,
    "metadata[propertyId]": link.propertyId,
  });
  if (link.guestEmail) params.set("customer_email", link.guestEmail);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `paylink-${link.id}`,
      "Stripe-Version": "2026-06-24.dahlia",
    },
    body: params.toString(),
  }).catch(() => null);
  if (!res || !res.ok) {
    throw new Error("The card payment could not be started. Please try again.");
  }
  const data = (await res.json().catch(() => null)) as { id?: string; url?: string } | null;
  if (!data?.id || !data?.url) throw new Error("The card payment could not be started. Please try again.");
  await prisma.paymentLink.update({ where: { id: link.id }, data: { stripeSessionId: data.id } });
  return { url: data.url };
}

// Webhook signature check (Stripe scheme): header "t=...,v1=..." over
// "t.rawBody" with the endpoint secret, 5-minute tolerance. Pure —
// unit-testable without a database. Returns false on ANY doubt.
export function verifyStripeSignature(rawBody: string, header: string, secret: string): boolean {
  if (!rawBody || !header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return i < 0 ? [p, ""] : [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const t = Number(parts.t);
  const v1 = parts.v1 ?? "";
  if (!Number.isFinite(t) || !/^[0-9a-f]{64}$/.test(v1)) return false;
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

// Idempotent paid marking from the webhook: first writer wins; replays
// return the same row. Returns null when the session is unknown (never
// throw — unknown sessions get a 200 so Stripe stops retrying).
// Tenant safety: the lookup is global BY DESIGN and safe — session ids
// are unguessable Stripe secrets, the webhook is signature-authenticated
// (no tenant input anywhere on this path), and each id maps to exactly
// one link row carrying its own propertyId. There is no tenant parameter
// to forge, so there is nothing to cross.
export async function markPaidByStripeSession(sessionId: string): Promise<PaymentLink | null> {
  const link = await prisma.paymentLink.findUnique({ where: { stripeSessionId: sessionId } });
  if (!link || link.status === "paid") return link;
  if (link.status !== "pending") return link;
  return prisma.paymentLink.update({
    where: { id: link.id },
    data: { status: "paid", paidAt: new Date() },
  });
}

// Staff confirmation for manual transfers (Settings, session-gated).
// Same idempotency: marking paid twice is a no-op, never an error.
export async function markManualPaid(
  id: string,
  propertyId: string,
  manualReference?: string
): Promise<PaymentLink | null> {
  const link = await prisma.paymentLink.findUnique({ where: { id } });
  if (!link || link.propertyId !== propertyId) return null;
  if (link.method !== "manual") return null;
  if (link.status === "paid") return link;
  if (link.status !== "pending") return null;
  return prisma.paymentLink.update({
    where: { id: link.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      ...(manualReference ? { manualReference } : {}),
    },
  });
}

// Default manual-transfer instructions. Deliberately generic — the
// resort's real account details ship per-property later; until then the
// guest gets the booking code + a pointer to staff, never a fake number.
export function manualInstructions(): string {
  return (
    process.env.MANUAL_PAYMENT_INSTRUCTIONS ??
    "Pay by bKash or bank transfer using the booking code as your reference, then share your transaction ID with the resort (reply here or call the number on your confirmation). Staff verify every manual payment before marking it paid — never send money to any account shared outside this page or the resort's official channels."
  );
}
