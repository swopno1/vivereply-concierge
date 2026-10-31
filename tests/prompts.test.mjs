// Prompt assembly tests: the PAYMENT section appears only when the
// resort configured its own payment page, and it points (never takes,
// never confirms). Citations, hold-release, and card-details rules ride
// in both languages regardless.
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
  it("omits PAYMENT rules when the resort set no payment page", () => {
    const p = systemPrompt("en", null, ROOMS, null, { resortPay: false });
    assert.ok(!p.includes("PAYMENT — this resort configured its own payment page"));
    assert.ok(p.includes("never invent a payment link or flow"));
    assert.ok(p.includes("never say whether a payment happened"));
  });
  it("points at the resort page when configured", () => {
    const p = systemPrompt("en", null, ROOMS, null, { resortPay: true });
    assert.ok(p.includes("PAYMENT — this resort configured its own payment page"));
    assert.ok(p.includes("get_resort_payment_link"));
    assert.ok(p.includes("NEVER confirm, deny, or guess a payment happened"));
  });
  it("covers Bengali turns with a Bengali payment block", () => {
    const p = systemPrompt("bn", null, ROOMS, null, { resortPay: true });
    assert.ok(p.includes("PAYMENT — this resort configured its own payment page"));
    assert.ok(p.includes("get_resort_payment_link"));
  });
});

describe("systemPrompt citation rule", () => {
  it("tells the model to name knowledge sources in both languages", () => {
    for (const lang of ["en", "bn"]) {
      const p = systemPrompt(lang, null, ROOMS, null, { resortPay: false });
      assert.ok(p.includes("name the source"), lang);
    }
  });
});

describe("systemPrompt greeting + group rules", () => {
  it("keeps bare greetings minimal and hands off large parties, both languages", () => {
    for (const lang of ["en", "bn"]) {
      const p = systemPrompt(lang, null, ROOMS, null, { resortPay: false });
      assert.ok(p.includes("do not list rooms or prices until asked"), lang);
      assert.ok(p.includes("request_handoff right away instead of quoting"), lang);
    }
  });
});

describe("systemPrompt hold-release rule", () => {
  it("tells the 24h release on every draft in both languages", () => {
    for (const lang of ["en", "bn"]) {
      const p = systemPrompt(lang, null, ROOMS, null, { resortPay: false });
      assert.ok(p.includes("hold releases after 24 hours"), lang);
    }
  });
});

describe("systemPrompt card-details rule", () => {
  it("is present in both languages with payments on or off", () => {
    for (const lang of ["en", "bn"]) {
      for (const resortPay of [false, true]) {
        const p = systemPrompt(lang, null, ROOMS, null, { resortPay });
        assert.ok(p.includes("NEVER repeat, confirm, or process them"), `${lang}/${resortPay}`);
        assert.ok(p.includes("chat is not a payment channel"), `${lang}/${resortPay}`);
      }
    }
  });
});
