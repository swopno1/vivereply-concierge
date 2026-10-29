// Prompt assembly tests: the PAYMENT section appears only for turns
// that take payments, and the METHODS placeholder is replaced with
// exactly the resort's accepted methods — never leaked verbatim.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { PROMPT_VERSION, systemPrompt } from "@/lib/prompts";

describe("PROMPT_VERSION", () => {
  it("is a positive integer the eval runner stamps", () => {
    assert.equal(Number.isInteger(PROMPT_VERSION), true);
    assert.ok(PROMPT_VERSION >= 1);
  });
});

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

describe("systemPrompt card-details rule", () => {
  it("is present in both languages with payments on or off", () => {
    for (const lang of ["en", "bn"]) {
      for (const payments of [false, true]) {
        const p = systemPrompt(lang, null, ROOMS, null, { payments, methods: ["card"] });
        assert.ok(p.includes("NEVER repeat, confirm, or process them"), `${lang}/${payments}`);
        assert.ok(p.includes("chat is not a payment channel"), `${lang}/${payments}`);
      }
    }
  });
});
