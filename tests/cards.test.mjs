// Card builder tests: cards repeat same-turn tool output verbatim and
// never assemble content of their own. The payment case pins the
// anti-phish rule: the card repeats the resort's own pay URL verbatim,
// carries no status (paid-or-not lives on the resort site), and
// non-http URLs never become buttons.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildCards } from "@/lib/cards";

const PAY_URL = "https://resort.example.com/pay?booking=RES-1";

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

  it("builds a resort-pay card repeating the resort URL verbatim", () => {
    const [card] = buildCards([
      {
        toolName: "get_resort_payment_link",
        input: {},
        output: { paymentUrl: PAY_URL, bookingCode: "RES-1" },
      },
    ]);
    assert.equal(card?.kind, "payment");
    assert.equal(card.paymentUrl, PAY_URL);
    assert.equal(card.bookingCode, "RES-1");
    assert.ok(!("status" in card));
  });

  it("refuses non-http payment URLs and code-less outputs", () => {
    const evil = buildCards([
      {
        toolName: "get_resort_payment_link",
        input: {},
        output: { paymentUrl: "javascript:alert(1)", bookingCode: "RES-1" },
      },
    ]);
    assert.deepEqual(evil, []);
    assert.deepEqual(
      buildCards([{ toolName: "get_resort_payment_link", input: {}, output: { paymentUrl: PAY_URL } }]),
      []
    );
  });
});
