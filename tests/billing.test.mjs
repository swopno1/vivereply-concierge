import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  TIER_QUOTA,
  gateDecision,
  monthKey,
  monthStartUtc,
  pauseMessage,
  quotaForTier,
  trialDay,
  trialDaysLeft,
} from "@/lib/billing";
import { priceIdFor, stripe, tierIntervalForPrice } from "@/lib/stripe";

const D = 86_400_000;
const now = new Date("2026-11-12T12:00:00Z");

function sub(overrides = {}) {
  return {
    tier: "GROWTH",
    status: "TRIAL",
    trialEndsAt: new Date(now.getTime() + 10 * D),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    overageAgreed: false,
    ...overrides,
  };
}

describe("billing time math", () => {
  it("month starts/keys are UTC calendar months", () => {
    assert.equal(monthStartUtc(new Date("2026-11-12T23:59:59Z")).toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(monthKey(new Date("2026-11-01T00:00:00Z")), "2026-11");
    assert.equal(monthKey(new Date("2026-01-31T23:59:59Z")), "2026-01");
  });
  it("trial days left rounds up, never negative; trial day is 1-based", () => {
    assert.equal(trialDaysLeft(new Date(now.getTime() + 10 * D), now), 10);
    assert.equal(trialDaysLeft(new Date(now.getTime() + 1), now), 1);
    assert.equal(trialDaysLeft(new Date(now.getTime() - 1), now), 0);
    assert.equal(trialDay(new Date(now.getTime() - 6 * D), now), 7);
    assert.equal(trialDay(now, now), 1);
  });
});

describe("quotaForTier", () => {
  it("maps the three tiers; unknown strings fall back to Starter", () => {
    assert.equal(quotaForTier("STARTER"), 500);
    assert.equal(quotaForTier("GROWTH"), 2000);
    assert.equal(quotaForTier("SCALE"), 7500);
    assert.equal(TIER_QUOTA.STARTER, 500);
    assert.equal(quotaForTier("PLATINUM"), 500);
    assert.equal(quotaForTier(""), 500);
  });
});

describe("gateDecision", () => {
  it("grandfathers properties without a subscription row", () => {
    assert.deepEqual(gateDecision(null, 999999, now), { allowed: true, reason: "ok" });
  });
  it("TRIAL: serves in-trial, pauses past the end even under quota", () => {
    assert.deepEqual(gateDecision(sub(), 0, now), { allowed: true, reason: "ok" });
    assert.deepEqual(
      gateDecision(sub({ trialEndsAt: new Date(now.getTime() - 1) }), 0, now),
      { allowed: false, reason: "trial-expired" }
    );
  });
  it("TRIAL: Growth hard stop at exactly 120%, overage never honored", () => {
    assert.deepEqual(gateDecision(sub(), 2399, now), { allowed: true, reason: "ok" });
    assert.deepEqual(gateDecision(sub(), 2400, now), { allowed: false, reason: "quota-exceeded" });
    assert.deepEqual(
      gateDecision(sub({ overageAgreed: true }), 2400, now),
      { allowed: false, reason: "quota-exceeded" }
    );
  });
  it("ACTIVE/PAST_DUE: tier quota, overage honored, exact boundary", () => {
    const active = sub({ status: "ACTIVE", tier: "STARTER" });
    assert.deepEqual(gateDecision(active, 599, now), { allowed: true, reason: "ok" });
    assert.deepEqual(gateDecision(active, 600, now), { allowed: false, reason: "quota-exceeded" });
    assert.deepEqual(
      gateDecision({ ...active, overageAgreed: true }, 6000, now),
      { allowed: true, reason: "ok" }
    );
    assert.deepEqual(
      gateDecision({ ...active, status: "PAST_DUE" }, 100, now),
      { allowed: true, reason: "ok" }
    );
  });
  it("CANCELED: serves to the period end, then pauses", () => {
    const future = new Date(now.getTime() + 5 * D);
    const past = new Date(now.getTime() - D);
    assert.deepEqual(
      gateDecision(sub({ status: "CANCELED", cancelAtPeriodEnd: true, currentPeriodEnd: future }), 100, now),
      { allowed: true, reason: "ok" }
    );
    assert.deepEqual(
      gateDecision(sub({ status: "CANCELED", cancelAtPeriodEnd: true, currentPeriodEnd: past }), 100, now),
      { allowed: false, reason: "subscription-ended" }
    );
    assert.deepEqual(
      gateDecision(sub({ status: "CANCELED", cancelAtPeriodEnd: false, currentPeriodEnd: future }), 100, now),
      { allowed: false, reason: "subscription-ended" }
    );
  });
  it("EXPIRED pauses; unknown statuses fail closed", () => {
    assert.deepEqual(gateDecision(sub({ status: "EXPIRED" }), 0, now), {
      allowed: false,
      reason: "subscription-ended",
    });
    assert.deepEqual(gateDecision(sub({ status: "LIMBO" }), 0, now), {
      allowed: false,
      reason: "billing-unknown",
    });
  });
});

describe("pauseMessage", () => {
  it("offers the human path with contact, leaks no billing state", () => {
    const msg = pauseMessage("trial-expired", { phone: "+8801", email: "a@b.c" });
    assert.ok(msg.includes("+8801") && msg.includes("a@b.c"));
    for (const m of [
      pauseMessage("trial-expired", null),
      pauseMessage("subscription-ended", null),
      pauseMessage("quota-exceeded", null),
      pauseMessage("billing-unknown", null),
    ]) {
      assert.ok(!/trial|quota|billing|payment|subscription|\$|invoice/i.test(m), m);
    }
  });
});

describe("stripe price map (env-driven)", () => {
  it("maps tier+interval both ways; unknown plans are null", () => {
    process.env.BILLING_PRICE_GROWTH_MONTHLY = "price_test_growth_m";
    process.env.BILLING_PRICE_SCALE_ANNUAL = "price_test_scale_a";
    assert.equal(priceIdFor("GROWTH", "MONTHLY"), "price_test_growth_m");
    assert.equal(priceIdFor("STARTER", "MONTHLY"), null);
    assert.equal(priceIdFor("GROWTH", "WEEKLY"), null);
    assert.deepEqual(tierIntervalForPrice("price_test_scale_a"), { tier: "SCALE", interval: "ANNUAL" });
    assert.equal(tierIntervalForPrice("price_nope"), null);
    delete process.env.BILLING_PRICE_GROWTH_MONTHLY;
    delete process.env.BILLING_PRICE_SCALE_ANNUAL;
  });
});

describe("stripe webhook signature (offline HMAC)", () => {
  it("accepts a well-signed event, rejects tampering", () => {
    process.env.BILLING_STRIPE_SECRET_KEY ??= "sk_test_dummy_for_hmac_only";
    const client = stripe();
    const payload = JSON.stringify({ id: "evt_test", object: "event", type: "ping" });
    const header = client.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
    const event = client.webhooks.constructEvent(payload, header, "whsec_test");
    assert.equal(event.id, "evt_test");
    assert.throws(() => client.webhooks.constructEvent(payload + "x", header, "whsec_test"));
    assert.throws(() => client.webhooks.constructEvent(payload, "t=1,v1=deadbeef", "whsec_test"));
  });
});
