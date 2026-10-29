// Payment pure-function tests: webhook signature acceptance/rejection,
// deep-link shape, and the off-by-default + suite-only gates. No
// database, no network — every function here is import-safe.
import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import {
  availableMethods,
  paymentOrigin,
  paymentUrlFor,
  paymentsEnabledGlobal,
  propertyTakesPayments,
  verifyStripeSignature,
} from "@/lib/payments";

const SAVED = { ...process.env };

afterEach(() => {
  for (const k of ["PAYMENTS_ENABLED", "STRIPE_SECRET_KEY", "APP_BASE_URL"]) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_test","type":"checkout.session.completed"}';
  const sign = (t) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

  it("accepts a fresh valid signature", () => {
    const t = Math.floor(Date.now() / 1000);
    assert.equal(verifyStripeSignature(body, `t=${t},v1=${sign(t)}`, secret), true);
  });
  it("rejects tampering, wrong secrets, stale and malformed input", () => {
    const t = Math.floor(Date.now() / 1000);
    const good = `t=${t},v1=${sign(t)}`;
    assert.equal(verifyStripeSignature(body + "x", good, secret), false);
    assert.equal(verifyStripeSignature(body, good, "whsec_nope"), false);
    assert.equal(verifyStripeSignature(body, `t=${t - 600},v1=${sign(t)}`, secret), false);
    assert.equal(verifyStripeSignature(body, "t=abc,v1=zzz", secret), false);
    assert.equal(verifyStripeSignature("", "", ""), false);
  });
});

describe("paymentUrlFor", () => {
  it("binds token + booking code to the configured origin", () => {
    assert.equal(
      paymentUrlFor({ token: "tok123", bookingCode: "RES-202610-00001" }, "https://app.vivereply.com"),
      "https://app.vivereply.com/pay/tok123?booking=RES-202610-00001"
    );
  });
});

describe("gates", () => {
  it("is off by default", () => {
    delete process.env.PAYMENTS_ENABLED;
    assert.equal(paymentsEnabledGlobal(), false);
    assert.equal(propertyTakesPayments("krishnachura-retreat"), false);
  });
  it("refuses fixtures even when flagged on", () => {
    process.env.PAYMENTS_ENABLED = "true";
    assert.equal(propertyTakesPayments("seabreeze-test"), false);
    assert.equal(propertyTakesPayments("krishnachura-retreat"), true);
  });
  it("offers manual always, card only with a key", () => {
    delete process.env.STRIPE_SECRET_KEY;
    assert.deepEqual(availableMethods(), ["manual"]);
    process.env.STRIPE_SECRET_KEY = "rk_test";
    assert.deepEqual(availableMethods(), ["stripe", "manual"]);
  });
});

describe("paymentOrigin", () => {
  it("fails closed without configured origin", () => {
    delete process.env.APP_BASE_URL;
    assert.throws(() => paymentOrigin(), /not configured/);
  });
  it("returns the trimmed canonical origin", () => {
    process.env.APP_BASE_URL = "https://app.vivereply.com/";
    assert.equal(paymentOrigin(), "https://app.vivereply.com");
  });
});
