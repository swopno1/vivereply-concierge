import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  TIER_QUOTA,
  countPropertiesForOwner,
  creationAllowed,
  gateDecision,
  limitExceededMessage,
  monthKey,
  monthStartUtc,
  pauseMessage,
  propertyLimitForTier,
  quotaForTier,
  trialDay,
  trialDaysLeft,
} from "@/lib/billing";
import { priceIdFor, stripe, tierIntervalForPrice } from "@/lib/stripe";
import { processWebhookEvent } from "@/lib/stripe-webhook";

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
  it("downgrade below usage: used counts against the NEW tier (no reset)", () => {
    // Growth (2000) → Starter (500) with 700 used this month: the 700
    // stand, so 700 >= 120% of 500 → paused until next month. This is
    // the quota side of change-plan proration (money side is Stripe's).
    assert.deepEqual(
      gateDecision(sub({ status: "ACTIVE", tier: "STARTER" }), 700, now),
      { allowed: false, reason: "quota-exceeded" }
    );
    // Same downgrade at 400 used: under the new quota, served.
    assert.deepEqual(
      gateDecision(sub({ status: "ACTIVE", tier: "STARTER" }), 400, now),
      { allowed: true, reason: "ok" }
    );
    // Upgrade side: Starter → Growth with 700 used serves (room to 2400).
    assert.deepEqual(
      gateDecision(sub({ status: "ACTIVE", tier: "GROWTH" }), 700, now),
      { allowed: true, reason: "ok" }
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

describe("property limit (Scale 3, else 1)", () => {
  it("maps tiers; missing/unknown tiers fail closed at 1", () => {
    assert.equal(propertyLimitForTier("SCALE"), 3);
    assert.equal(propertyLimitForTier("STARTER"), 1);
    assert.equal(propertyLimitForTier("GROWTH"), 1);
    assert.equal(propertyLimitForTier(null), 1);
    assert.equal(propertyLimitForTier("PLATINUM"), 1);
  });
  it("Scale: 1st/2nd/3rd allowed, 4th rejected", () => {
    assert.equal(creationAllowed("SCALE", 0), true);
    assert.equal(creationAllowed("SCALE", 1), true);
    assert.equal(creationAllowed("SCALE", 2), true);
    assert.equal(creationAllowed("SCALE", 3), false);
    assert.equal(creationAllowed("SCALE", 4), false);
  });
  it("Starter/Growth/missing: 1st allowed, 2nd rejected", () => {
    for (const tier of ["STARTER", "GROWTH", null, "PLATINUM"]) {
      assert.equal(creationAllowed(tier, 0), true, tier);
      assert.equal(creationAllowed(tier, 1), false, tier);
    }
  });
  it("refusal copy names the way out, never a figure", () => {
    assert.ok(limitExceededMessage("SCALE").includes("3"));
    assert.ok(limitExceededMessage("STARTER").includes("Scale"));
    for (const m of [limitExceededMessage("SCALE"), limitExceededMessage("GROWTH"), limitExceededMessage(null)]) {
      assert.ok(!/\$/.test(m), m);
    }
  });
});

describe("countPropertiesForOwner (stub client, no DB)", () => {
  // Fake CounterClient over fixture rows.
  function stub({ linkedCount, userPropertyId, properties }) {
    return {
      property: {
        count: async () => linkedCount,
        findUnique: async ({ where }) => {
          const row = properties[where.id];
          return row === undefined ? null : { ownerEmail: row };
        },
      },
      user: {
        findUnique: async () => (userPropertyId === undefined ? null : { propertyId: userPropertyId }),
      },
    };
  }
  it("new email owns nothing", async () => {
    const n = await countPropertiesForOwner(stub({ linkedCount: 0, userPropertyId: undefined, properties: {} }), "new@x.test");
    assert.equal(n, 0);
  });
  it("linked properties count once (no double-count with the user row)", async () => {
    const n = await countPropertiesForOwner(
      stub({ linkedCount: 2, userPropertyId: "p1", properties: { p1: "o@x.test" } }),
      "o@x.test"
    );
    assert.equal(n, 2);
  });
  it("grandfathered (NULL ownerEmail) user-row property still counts", async () => {
    const n = await countPropertiesForOwner(
      stub({ linkedCount: 0, userPropertyId: "p1", properties: { p1: null } }),
      "o@x.test"
    );
    assert.equal(n, 1);
  });
  it("mixed: two linked + one grandfathered = 3 (Scale full)", async () => {
    const n = await countPropertiesForOwner(
      stub({ linkedCount: 2, userPropertyId: "p1", properties: { p1: null } }),
      "o@x.test"
    );
    assert.equal(n, 3);
    assert.equal(creationAllowed("SCALE", n), false);
  });
  it("dangling user row (property gone) counts linked only", async () => {
    const n = await countPropertiesForOwner(
      stub({ linkedCount: 1, userPropertyId: "ghost", properties: {} }),
      "o@x.test"
    );
    assert.equal(n, 1);
  });
});

describe("webhook order (claim-first, injected effects)", () => {
  const event = { id: "evt_test_dup", type: "invoice.payment_failed" };
  const verifyOk = () => event;
  const verifyBad = () => {
    throw new Error("bad signature");
  };

  it("first delivery claims then applies exactly once", async () => {
    let claims = 0;
    let applies = 0;
    const out = await processWebhookEvent({
      raw: "{}",
      signature: "sig",
      verify: verifyOk,
      claim: async () => {
        claims += 1;
        return true;
      },
      apply: async () => {
        applies += 1;
      },
    });
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { received: true, duplicate: false });
    assert.equal(claims, 1);
    assert.equal(applies, 1);
  });

  it("duplicate delivery applies NOTHING (two deliveries, one apply)", async () => {
    const seen = new Set();
    let applies = 0;
    const claim = async (id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    };
    const apply = async () => {
      applies += 1;
    };
    const first = await processWebhookEvent({ raw: "{}", signature: "s", verify: verifyOk, claim, apply });
    const second = await processWebhookEvent({ raw: "{}", signature: "s", verify: verifyOk, claim, apply });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, { received: true, duplicate: false });
    assert.equal(second.status, 200);
    assert.deepEqual(second.body, { received: true, duplicate: true });
    assert.equal(applies, 1);
  });

  it("bad signature touches neither claim nor apply", async () => {
    let claims = 0;
    let applies = 0;
    const out = await processWebhookEvent({
      raw: "{}",
      signature: "bogus",
      verify: verifyBad,
      claim: async () => {
        claims += 1;
        return true;
      },
      apply: async () => {
        applies += 1;
      },
    });
    assert.equal(out.status, 400);
    assert.equal(claims, 0);
    assert.equal(applies, 0);
  });

  it("sick database on claim 500s without applying", async () => {
    let applies = 0;
    const out = await processWebhookEvent({
      raw: "{}",
      signature: "s",
      verify: verifyOk,
      claim: async () => {
        throw new Error("db down");
      },
      apply: async () => {
        applies += 1;
      },
    });
    assert.equal(out.status, 500);
    assert.equal(applies, 0);
  });

  it("apply crash 500s (loud, for manual replay)", async () => {
    const out = await processWebhookEvent({
      raw: "{}",
      signature: "s",
      verify: verifyOk,
      claim: async () => true,
      apply: async () => {
        throw new Error("apply blew up");
      },
    });
    assert.equal(out.status, 500);
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
