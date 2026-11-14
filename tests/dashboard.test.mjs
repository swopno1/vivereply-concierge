import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attentionItems,
  checklistComplete,
  checklistSteps,
  validateSwitchTarget,
} from "@/lib/dashboard";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function snap(over = {}) {
  return {
    hasSubscription: true,
    status: "ACTIVE",
    tier: "GROWTH",
    interval: "MONTHLY",
    trialEndsAt: null,
    trialDaysLeft: 0,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    overageAgreed: false,
    usageThisMonth: 10,
    quotaThisMonth: 100,
    gate: { allowed: true, reason: "ok" },
    ...over,
  };
}

describe("switch validation (D1)", () => {
  const owner = { role: "OWNER", email: "owner@resort.example", propertyId: "prop-1" };
  const own = { id: "prop-1", status: "ACTIVE", ownerEmail: "owner@resort.example" };
  const second = { id: "prop-2", status: "ACTIVE", ownerEmail: "owner@resort.example" };

  it("allows the owner's own and co-owned ACTIVE properties", () => {
    assert.equal(validateSwitchTarget(owner, own), "prop-1");
    assert.equal(validateSwitchTarget(owner, second), "prop-2");
  });

  it("fails closed on foreign, inactive, or missing targets", () => {
    assert.equal(validateSwitchTarget(owner, { id: "prop-x", status: "ACTIVE", ownerEmail: "other@x.com" }), null);
    assert.equal(validateSwitchTarget(owner, { id: "prop-2", status: "SUSPENDED", ownerEmail: "owner@resort.example" }), null);
    assert.equal(validateSwitchTarget(owner, null), null);
  });

  it("fails closed for non-owners and signed-out callers", () => {
    assert.equal(validateSwitchTarget({ role: "SUPER_ADMIN", email: null, propertyId: null }, second), null);
    assert.equal(validateSwitchTarget(null, second), null);
  });

  it("accepts the pre-fix self row (no ownerEmail) only for the session property", () => {
    assert.equal(validateSwitchTarget(owner, { id: "prop-1", status: "ACTIVE", ownerEmail: null }), "prop-1");
    assert.equal(validateSwitchTarget(owner, { id: "prop-9", status: "ACTIVE", ownerEmail: null }), null);
  });
});

describe("attention strip matrix (D1)", () => {
  it("renders nothing without data, without a subscription, or when all is well", () => {
    assert.deepEqual(attentionItems({ snapshot: null }), []);
    assert.deepEqual(attentionItems({ snapshot: snap({ hasSubscription: false }) }), []);
    assert.deepEqual(attentionItems({ snapshot: snap() }), []);
  });

  it("shows a billing pause as exactly one item, beating trial-ending", () => {
    const quota = attentionItems({ snapshot: snap({ gate: { allowed: false, reason: "quota-exceeded" } }) });
    assert.equal(quota.length, 1);
    assert.match(quota[0].text, /monthly limit/);
    assert.equal(quota[0].href, "/billing");

    const trial = attentionItems({
      snapshot: snap({ status: "TRIAL", trialDaysLeft: 0, gate: { allowed: false, reason: "trial-expired" } }),
    });
    assert.equal(trial.length, 1);
    assert.match(trial[0].text, /Trial ended/);

    const sub = attentionItems({ snapshot: snap({ gate: { allowed: false, reason: "subscription-ended" } }) });
    assert.equal(sub.length, 1);
    assert.match(sub[0].text, /subscribe to resume/);
  });

  it("shows past-due while chat keeps running", () => {
    const items = attentionItems({ snapshot: snap({ status: "PAST_DUE" }) });
    assert.equal(items.length, 1);
    assert.match(items[0].text, /payment failed/);
    assert.equal(items[0].href, "/billing");
  });

  it("warns on trial ending within 7 days, with today-wording at the edge", () => {
    assert.equal(attentionItems({ snapshot: snap({ status: "TRIAL", trialDaysLeft: 8 }) }).length, 0);
    const week = attentionItems({ snapshot: snap({ status: "TRIAL", trialDaysLeft: 7 }) });
    assert.equal(week.length, 1);
    assert.match(week[0].text, /ends in 7 days/);
    const today = attentionItems({ snapshot: snap({ status: "TRIAL", trialDaysLeft: 1 }) });
    assert.match(today[0].text, /ends today/);
  });

  it("keeps past-due and trial-ending mutually exclusive (single status)", () => {
    assert.deepEqual(
      attentionItems({ snapshot: snap({ status: "PAST_DUE" }) }).map((i) => i.id),
      ["past-due"]
    );
    assert.deepEqual(
      attentionItems({ snapshot: snap({ status: "TRIAL", trialDaysLeft: 3 }) }).map((i) => i.id),
      ["trial-ending"]
    );
  });
});

describe("first-run checklist derivation (D1)", () => {
  it("ticks each step from its own state bit", () => {
    const all = checklistSteps({ hasProperty: true, bindingTestOk: true, widgetKeyMinted: true, hasConversation: true });
    assert.deepEqual(
      all.map((s) => [s.id, s.done]),
      [
        ["property", true],
        ["binding", true],
        ["widget", true],
        ["chat", true],
      ]
    );
    assert.ok(checklistComplete({ hasProperty: true, bindingTestOk: true, widgetKeyMinted: true, hasConversation: true }));
  });

  it("leaves steps pending until their state holds, and deep-links each", () => {
    const steps = checklistSteps({ hasProperty: true, bindingTestOk: false, widgetKeyMinted: true, hasConversation: false });
    assert.deepEqual(
      steps.map((s) => [s.id, s.done, s.href]),
      [
        ["property", true, "/settings"],
        ["binding", false, "/chatbot/booking"],
        ["widget", true, "/setup/kit"],
        ["chat", false, "/assistant"],
      ]
    );
    assert.equal(
      checklistComplete({ hasProperty: true, bindingTestOk: false, widgetKeyMinted: true, hasConversation: false }),
      false
    );
  });
});

describe("assistant parity (D1)", () => {
  it("serves the moved landing chat with both token scopes intact", () => {
    // The D1 move is a relocation: /assistant/page.tsx is the old landing
    // page with its import depth and login target adjusted. Answering
    // itself is /api/chat (untouched, covered by the chat suites); this
    // pins the route contract that feeds it.
    const source = readFileSync(join(ROOT, "app/(shell)/assistant/page.tsx"), "utf8");
    assert.match(source, /from "\.\.\/\.\.\/components\/Chat"/);
    assert.match(source, /createChatToken\(\{ propertyId: "", scope: "brand" \}\)/);
    assert.match(source, /createChatToken\(\{ propertyId, scope: "direct" \}\)/);
    assert.match(source, /redirect\("\/login\?next=\/assistant"\)/);
  });
});
