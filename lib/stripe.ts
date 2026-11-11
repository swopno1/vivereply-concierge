// Platform Stripe client (Phase 3 — OUR subscription billing).
// One Stripe account (Vivereply's): Checkout Sessions for new
// subscriptions, subscription updates for plan changes/cancel, and
// signature-verified webhooks that sync the Subscription rows. Guest
// money is nowhere near this module (see lib/billing.ts invariant).
// Test mode first: the founder wires test keys, runs a live test
// checkout, then swaps to live keys — the code never knows which.

import Stripe from "stripe";
import { VALID_INTERVALS, VALID_TIERS } from "@/lib/billing";

let cached: Stripe | null = null;

// Lazy singleton: throws when BILLING_STRIPE_SECRET_KEY is unset, so
// billing routes fail closed ("Billing is not configured") instead
// of running half-wired. Restricted key (rk_…) with only the
// subscription + checkout + customer scopes the dashboard allows.
export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.BILLING_STRIPE_SECRET_KEY ?? "";
  if (!key) throw new Error("Billing is not configured.");
  cached = new Stripe(key);
  return cached;
}

export function stripeWebhookSecret(): string {
  const secret = process.env.BILLING_STRIPE_WEBHOOK_SECRET ?? "";
  if (!secret) throw new Error("Billing is not configured.");
  return secret;
}

// Tier+interval → Stripe Price id (env, founder-set from the prices
// they create in test mode, then live). NULL when unmapped —
// callers treat that as "that plan isn't for sale right now", never
// as a reason to guess a price.
export function priceIdFor(tier: string, interval: string): string | null {
  if (
    !(VALID_TIERS as readonly string[]).includes(tier) ||
    !(VALID_INTERVALS as readonly string[]).includes(interval)
  ) {
    return null;
  }
  const id = process.env[`BILLING_PRICE_${tier}_${interval}`] ?? "";
  return id || null;
}

// Reverse map for webhook sync when subscription metadata is absent
// (older sessions, dashboard-created subs): price id → tier+interval.
// NULL when the price isn't one of ours — the webhook then keeps the
// row's existing tier rather than inventing one.
export function tierIntervalForPrice(priceId: string): {
  tier: string;
  interval: string;
} | null {
  for (const tier of VALID_TIERS) {
    for (const interval of VALID_INTERVALS) {
      if (process.env[`BILLING_PRICE_${tier}_${interval}`] === priceId) {
        return { tier, interval };
      }
    }
  }
  return null;
}
