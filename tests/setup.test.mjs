// Setup-state tests: progress is derived, never stored — each step is
// done only when its live check passes. No step may claim done on hope.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { deriveSetupState } from "@/lib/setup";

function facts(over = {}) {
  return {
    propertyId: "p1",
    propertyName: "Test Inn",
    widgetKey: "key-p1",
    emailVerified: true,
    activeDomains: [],
    binding: null,
    roomCount: 0,
    opensTotal: 0,
    lastOpenedAt: null,
    bridgeActiveCount: 0,
    ...over,
  };
}

function statusOf(state, id) {
  return state.steps.find((s) => s.id === id).status;
}

describe("deriveSetupState", () => {
  it("starts all-pending except property (which exists by construction)", () => {
    const s = deriveSetupState(facts({ emailVerified: false }));
    assert.equal(statusOf(s, "account"), "pending");
    assert.equal(statusOf(s, "property"), "done");
    assert.equal(statusOf(s, "domain"), "pending");
    assert.equal(statusOf(s, "widget"), "pending");
    assert.equal(statusOf(s, "booking"), "pending");
    assert.equal(statusOf(s, "bridge"), "optional");
    assert.equal(s.complete, false);
  });
  it("completes only when every required check passes", () => {
    const binding = { suiteBaseUrl: "https://suite.test", hasSecret: true, lastTestedAt: "2026-10-30T00:00:00.000Z", lastTestOk: true };
    const s = deriveSetupState(
      facts({ activeDomains: ["inn.test"], binding, roomCount: 3, opensTotal: 5, lastOpenedAt: "2026-10-30T00:00:00.000Z" })
    );
    assert.equal(s.complete, true);
    assert.equal(statusOf(s, "bridge"), "optional");
  });
  it("holds booking pending until saved + green + rooms", () => {
    const noTest = { suiteBaseUrl: "https://suite.test", hasSecret: false, lastTestedAt: null, lastTestOk: null };
    assert.equal(statusOf(deriveSetupState(facts({ binding: noTest, roomCount: 3 })), "booking"), "pending");
    const redTest = { ...noTest, lastTestedAt: "2026-10-30T00:00:00.000Z", lastTestOk: false };
    assert.equal(statusOf(deriveSetupState(facts({ binding: redTest, roomCount: 3 })), "booking"), "pending");
    const green = { ...redTest, lastTestOk: true };
    assert.equal(statusOf(deriveSetupState(facts({ binding: green, roomCount: 0 })), "booking"), "pending");
    assert.equal(statusOf(deriveSetupState(facts({ binding: green, roomCount: 1 })), "booking"), "done");
  });
  it("bridge never blocks completion", () => {
    const binding = { suiteBaseUrl: "https://suite.test", hasSecret: false, lastTestedAt: "t", lastTestOk: true };
    const s = deriveSetupState(facts({ activeDomains: ["a.bc"], binding, roomCount: 1, opensTotal: 1 }));
    assert.equal(s.complete, true);
    const s2 = deriveSetupState(facts({ activeDomains: ["a.bc"], binding, roomCount: 1, opensTotal: 1, bridgeActiveCount: 2 }));
    assert.equal(statusOf(s2, "bridge"), "done");
    assert.equal(s2.complete, true);
  });
});
