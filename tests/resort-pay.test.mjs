// Resort-pay pointer tests: the bot deep-links the resort's OWN pay page
// with ?booking=CODE. URL cleaning rejects non-https (in production),
// and link building appends the booking code without ever inventing a host.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { cleanPaymentPageUrl, resortPaymentUrl } from "@/lib/resort-pay";

describe("cleanPaymentPageUrl", () => {
  it("accepts https page URLs, trims and de-slashes", () => {
    assert.equal(
      cleanPaymentPageUrl("  https://resort.example.com/pay/ "),
      "https://resort.example.com/pay"
    );
  });
  it("rejects non-URLs, wrong schemes, empties, oversize", () => {
    assert.equal(cleanPaymentPageUrl("not a url"), null);
    assert.equal(cleanPaymentPageUrl("ftp://x.example/pay"), null);
    assert.equal(cleanPaymentPageUrl(""), null);
    assert.equal(cleanPaymentPageUrl(null), null);
    assert.equal(cleanPaymentPageUrl(42), null);
    assert.equal(cleanPaymentPageUrl("https://x.example/" + "y".repeat(600)), null);
  });
});

describe("resortPaymentUrl", () => {
  it("appends ?booking= when the page has no query", () => {
    assert.equal(
      resortPaymentUrl("https://resort.example.com/pay", "RES-1"),
      "https://resort.example.com/pay?booking=RES-1"
    );
  });
  it("appends &booking= when the page already has a query", () => {
    assert.equal(
      resortPaymentUrl("https://resort.example.com/pay?lang=en", "RES-1"),
      "https://resort.example.com/pay?lang=en&booking=RES-1"
    );
  });
  it("encodes the booking code", () => {
    assert.equal(
      resortPaymentUrl("https://resort.example.com/pay", "RES 1/2"),
      "https://resort.example.com/pay?booking=RES%201%2F2"
    );
  });
});
