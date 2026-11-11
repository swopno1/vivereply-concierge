// Subscription billing core (Phase 3 — resorts paying US via Stripe).
// Trial (30 days, no card, Growth features) → paid tiers via Stripe
// Checkout → quotas enforced on guest chat. INVARIANT (founder,
// standing): resort GUEST money NEVER touches our Stripe account —
// guest payments happen on the resort's own site (lib/resort-pay.ts);
// only the subscription flows here, per property, never per guest.
//
// Tiers (founder-approved 2026-11-11, validation-gated per
// docs/pricing-worksheet.md): Starter 500, Growth 2,000 (trial runs
// this), Scale 7,500 conversations/month. NO DOLLAR FIGURES live in
// this module or anywhere in the UI until the founder says publish —
// prices live in Stripe Price ids (env), and the app shows plan
// names + limits only.
//
// The quota unit: ONE CONVERSATION = ONE Conversation ROW created in
// the calendar month (UTC). A new guest thread counts; follow-up
// turns in the same thread don't. Paused attempts never create rows,
// so they never consume quota. Usage month = calendar month (simple,
// auditable, matches "conversations handled" language).

import { Prisma } from "@prisma/client";
import { prismaService } from "@/lib/prisma";

// ---- constants (quotas only — never prices) ----

export const TRIAL_DAYS = 30;
export const TRIAL_TIER = "GROWTH";
export const USAGE_ALERT_RATIO = 0.8;
export const HARD_STOP_RATIO = 1.2;

export const TIER_QUOTA: Record<string, number> = {
  STARTER: 500,
  GROWTH: 2000,
  SCALE: 7500,
};

export const TIER_NAMES: Record<string, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  SCALE: "Scale",
};

export const VALID_TIERS = ["STARTER", "GROWTH", "SCALE"] as const;
export const VALID_INTERVALS = ["MONTHLY", "ANNUAL"] as const;

// Unknown tier strings (data drift — our writers validate, so this
// means hand-edited rows) fall back to the SMALLEST quota: bounded
// exposure, never a zero-outage, never unlimited.
export function quotaForTier(tier: string): number {
  return TIER_QUOTA[tier] ?? TIER_QUOTA.STARTER;
}

export function tierName(tier: string): string {
  return TIER_NAMES[tier] ?? "Starter";
}

// ---- time helpers (UTC, injection-friendly for tests) ----

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// "2026-11" — period key for monthly notices (USAGE_80, PAYMENT_FAILED).
export function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Whole days left on the trial (0 once past the end — never negative).
export function trialDaysLeft(trialEndsAt: Date, now: Date): number {
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

// 1-based trial day from creation (day 1 = creation day). Drives the
// day-7/21/27/30 reminder schedule.
export function trialDay(createdAt: Date, now: Date): number {
  const ms = now.getTime() - createdAt.getTime();
  return ms < 0 ? 1 : Math.floor(ms / 86_400_000) + 1;
}

// ---- the gate (pure: subscription row + usage count in, verdict out) ----

export type SubscriptionRow = {
  tier: string;
  status: string;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  overageAgreed: boolean;
};

export type GateReason =
  | "ok"
  | "trial-expired"
  | "subscription-ended"
  | "quota-exceeded"
  | "billing-unknown";

export type GateVerdict = { allowed: boolean; reason: GateReason };

// Decides whether guest chat serves a property. NULL subscription =
// grandfathered (demo, seeds, pre-Phase-3 rows): full access, no
// clock. Everything else follows the status machine (see schema).
// PAST_DUE stays served while Stripe retries; CANCELED serves to the
// period end, then pauses; EXPIRED and spent trials pause. The 120%
// hard stop honors overageAgreed ONLY with a live subscription — a
// trial has no card, so trial overage can't be billed and always
// stops. Unknown statuses fail closed (generic reason, honest
// message, no state leak to the guest).
export function gateDecision(
  sub: SubscriptionRow | null,
  usageThisMonth: number,
  now: Date
): GateVerdict {
  if (!sub) return { allowed: true, reason: "ok" };
  const overQuota =
    usageThisMonth >= Math.floor(quotaForTier(sub.tier) * HARD_STOP_RATIO);
  switch (sub.status) {
    case "TRIAL":
      if (now.getTime() > sub.trialEndsAt.getTime()) {
        return { allowed: false, reason: "trial-expired" };
      }
      // Trial quota is the Growth quota (tier defaults to GROWTH and
      // nothing changes it mid-trial), hard stop unconditional.
      if (usageThisMonth >= Math.floor(TIER_QUOTA.GROWTH * HARD_STOP_RATIO)) {
        return { allowed: false, reason: "quota-exceeded" };
      }
      return { allowed: true, reason: "ok" };
    case "ACTIVE":
    case "PAST_DUE":
      if (overQuota && !sub.overageAgreed) {
        return { allowed: false, reason: "quota-exceeded" };
      }
      return { allowed: true, reason: "ok" };
    case "CANCELED":
      if (
        sub.cancelAtPeriodEnd &&
        sub.currentPeriodEnd &&
        now.getTime() <= sub.currentPeriodEnd.getTime()
      ) {
        if (overQuota && !sub.overageAgreed) {
          return { allowed: false, reason: "quota-exceeded" };
        }
        return { allowed: true, reason: "ok" };
      }
      return { allowed: false, reason: "subscription-ended" };
    case "EXPIRED":
      return { allowed: false, reason: "subscription-ended" };
    default:
      return { allowed: false, reason: "billing-unknown" };
  }
}

// ---- service layer (marked paths only; callers scope by session) ----

// Conversations opened since the UTC month started. Runs on any
// client: the chat gate passes its tenant tx, pages/cron use the
// service client (scoped to the session's property by the caller).
export async function usageThisMonth(
  client: { conversation: { count(args: unknown): Promise<number> } },
  propertyId: string,
  now: Date
): Promise<number> {
  return client.conversation.count({
    where: { propertyId, createdAt: { gte: monthStartUtc(now) } },
  });
}

// Creates the TRIAL row inside the property-creation transaction
// (signup + admin create). Trial = created + 30 days, Growth tier,
// no Stripe ids — the card comes later via Checkout.
export async function startTrial(
  tx: { subscription: { create(args: unknown): Promise<unknown> } },
  propertyId: string,
  now: Date
): Promise<void> {
  await tx.subscription.create({
    data: {
      propertyId,
      tier: TRIAL_TIER,
      interval: "MONTHLY",
      status: "TRIAL",
      trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000),
    },
  });
}

export type BillingSnapshot = {
  hasSubscription: boolean;
  status: string;
  tier: string;
  interval: string;
  trialEndsAt: Date | null;
  trialDaysLeft: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  overageAgreed: boolean;
  usageThisMonth: number;
  quotaThisMonth: number;
  gate: GateVerdict;
};

// Everything the billing page + shell banner need in one call.
// SERVICE READ (marked): scoped to the session's property by the
// caller — never called with an untrusted propertyId.
export async function getBillingSnapshot(
  propertyId: string,
  now: Date
): Promise<BillingSnapshot> {
  const db = prismaService();
  const sub = await db.subscription
    .findUnique({ where: { propertyId } })
    .catch(() => null);
  if (!sub) {
    return {
      hasSubscription: false,
      status: "NONE",
      tier: TRIAL_TIER,
      interval: "MONTHLY",
      trialEndsAt: null,
      trialDaysLeft: 0,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      overageAgreed: false,
      usageThisMonth: 0,
      quotaThisMonth: TIER_QUOTA.GROWTH,
      gate: { allowed: true, reason: "ok" },
    };
  }
  const usage = await db.conversation
    .count({ where: { propertyId, createdAt: { gte: monthStartUtc(now) } } })
    .catch(() => 0);
  const quota = sub.status === "TRIAL" ? TIER_QUOTA.GROWTH : quotaForTier(sub.tier);
  return {
    hasSubscription: true,
    status: sub.status,
    tier: sub.tier,
    interval: sub.interval,
    trialEndsAt: sub.trialEndsAt,
    trialDaysLeft: trialDaysLeft(sub.trialEndsAt, now),
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    overageAgreed: sub.overageAgreed,
    usageThisMonth: usage,
    quotaThisMonth: quota,
    gate: gateDecision(
      {
        tier: sub.tier,
        status: sub.status,
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        overageAgreed: sub.overageAgreed,
      },
      usage,
      now
    ),
  };
}

export async function hasNotice(
  propertyId: string,
  kind: string,
  periodKey: string
): Promise<boolean> {
  const row = await prismaService().billingNotice
    .findUnique({ where: { propertyId_kind_periodKey: { propertyId, kind, periodKey } } })
    .catch(() => null);
  return !!row;
}

export async function recordNotice(
  propertyId: string,
  kind: string,
  periodKey: string
): Promise<void> {
  await prismaService().billingNotice.create({ data: { propertyId, kind, periodKey } });
}

// Webhook idempotency: the Stripe event id is the primary key. True
// = first sighting, apply the event; false = redelivery, answer 200
// without re-applying. Only P2002 means "seen" — any other error
// rethrows so Stripe retries a sick database (never a silent drop).
export async function claimStripeEvent(id: string, type: string): Promise<boolean> {
  try {
    await prismaService().stripeEvent.create({ data: { id, type } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return false;
    }
    throw e;
  }
}

// ---- guest-facing pause copy (honest, no state leak, handoff offer) ----

export type ResortContact = { phone?: string | null; email?: string | null };

function contactLine(contact: ResortContact | null): string {
  if (!contact) return "";
  const bits: string[] = [];
  if (contact.phone) bits.push(`call us at ${contact.phone}`);
  if (contact.email) bits.push(`email ${contact.email}`);
  if (bits.length === 0) return "";
  return ` To reach us right now, please ${bits.join(" or ")}.`;
}

// What the paused guest reads IN the chat thread (served as a normal
// reply, not an error toast): honest about the pause, offers the
// human path, never blames the guest, never mentions billing,
// trials, quotas, or money — those are owner business.
export function pauseMessage(reason: GateReason, contact: ResortContact | null): string {
  const tail = contactLine(contact);
  switch (reason) {
    case "trial-expired":
    case "subscription-ended":
      return (
        `Our chat assistant is temporarily unavailable — please contact the resort directly and the team will help you right away.${tail ? ` ${tail.trim()}` : ""}`
      );
    case "quota-exceeded":
      return (
        `Our chat assistant is taking a short break because of high demand — please contact the resort directly and the team will help you right away.${tail ? ` ${tail.trim()}` : ""}`
      );
    default:
      return (
        `Our chat assistant is temporarily unavailable — please contact the resort directly.${tail ? ` ${tail.trim()}` : ""}`
      );
  }
}
