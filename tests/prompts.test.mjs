// Prompt assembly tests: the PAYMENT section appears only for turns
// that take payments, and the METHODS placeholder is replaced with
// exactly the resort's accepted methods — never leaked verbatim.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { systemPrompt } from "@/lib/prompts";

const ROOMS = [
  { slug: "test-villa", name: "Test Villa", basePricePoisha: 1450000, suiteRoomId: "suite-1", highlights: ["Sea view"] },
];

describe("systemPrompt payments section", () => {
  it("omits PAYMENT rules when payments are off", () => {
    const p = systemPrompt("en", null, ROOMS, null, { payments: false });
    assert.ok(!p.includes("PAYMENT — booking payments are ENABLED"));
    assert.ok(p.includes("never invent a payment link or flow"));
  });
  it("includes methods exactly when payments are on", () => {
    const p = systemPrompt("en", null, ROOMS, null, {
      payments: true,
      methods: ["card (Visa via Stripe)", "manual transfer (bKash)"],
    });
    assert.ok(p.includes("PAYMENT — booking payments are ENABLED"));
    assert.ok(p.includes("card (Visa via Stripe); manual transfer (bKash)"));
    assert.ok(!p.includes("METHODS"));
  });
  it("covers Bengali turns with a Bengali payment block", () => {
    const p = systemPrompt("bn", null, ROOMS, null, { payments: true, methods: ["card"] });
    assert.ok(p.includes("PAYMENT — booking payments are ENABLED"));
    assert.ok(p.includes("create_payment_link"));
  });
});
