// Card builder tests: cards repeat same-turn tool output verbatim and
// never assemble content of their own. The payment cases pin the
// anti-phish rules: pending carries the minted URL, paid carries none,
// and non-http URLs never become buttons.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildCards } from "@/lib/cards";

const PAY_URL = "https://app.vivereply.com/pay/tok123?booking=RES-1";

describe("buildCards", () => {
  it("builds a quote card from a successful quote output", () => {
    const [card] = buildCards([
      {
        toolName: "get_quote",
        input: {},
        output: {
          room: "Terracotta Villa",
          checkIn: "2026-11-10",
          checkOut: "2026-11-12",
          nights: 2,
          total: "৳29,000",
          available: 1,
        },
      },
    ]);
    assert.equal(card?.kind, "quote");
    assert.equal(card.total, "৳29,000");
  });

  it("builds nothing from an error output", () => {
    assert.deepEqual(buildCards([{ toolName: "get_quote", input: {}, output: { error: "nope" } }]), []);
  });

  it("builds a pending payment card carrying the minted URL", () => {
    const [card] = buildCards([
      {
        toolName: "create_payment_link",
        input: { method: "stripe" },
        output: {
          paymentUrl: PAY_URL,
          bookingCode: "RES-1",
          amount: "৳29,000",
          methodLabel: "card",
          expiresAt: "2026-11-11T00:00:00.000Z",
        },
      },
    ]);
    assert.equal(card?.kind, "payment");
    assert.equal(card.status, "pending");
    assert.equal(card.paymentUrl, PAY_URL);
  });

  it("builds a paid card with no URL", () => {
    const [card] = buildCards([
      {
        toolName: "check_payment_status",
        input: {},
        output: {
          found: true,
          status: "paid",
          bookingCode: "RES-1",
          amount: "৳29,000",
          methodLabel: "card",
          paidAt: "2026-10-29T00:00:00.000Z",
          paymentUrl: null,
        },
      },
    ]);
    assert.equal(card?.status, "paid");
    assert.equal(card.paymentUrl, null);
  });

  it("refuses non-http payment URLs and found:false", () => {
    const evil = buildCards([
      {
        toolName: "create_payment_link",
        input: {},
        output: {
          paymentUrl: "javascript:alert(1)",
          bookingCode: "RES-1",
          amount: "x",
          methodLabel: "y",
          expiresAt: "z",
        },
      },
    ]);
    assert.deepEqual(evil, []);
    assert.deepEqual(buildCards([{ toolName: "check_payment_status", input: {}, output: { found: false } }]), []);
  });
});
