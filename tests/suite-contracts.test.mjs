// Suite contract tests: idempotency replay + 429 mapping, no network.
// The fixture adapter replays the same draft for a repeated key (the
// in-memory mirror of the Idempotency-Key contract); the HTTP adapter
// maps a 429 to "rate_limited" (first-class, even with an empty body)
// and sends the key as a header. Fetch is stubbed, never real.
import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { FixtureSuiteAdapter, HttpSuiteAdapter } from "@/lib/suite";

const GUEST = { guestName: "A Test", guestEmail: "a@b.c", guestPhone: "1" };
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fixture idempotency", () => {
  it("replays the same draft for a repeated key, mints for a new one", async () => {
    const suite = new FixtureSuiteAdapter("seabreeze-test");
    const first = await suite.createBooking("fx-harbor-suite", GUEST, "2026-11-10", "2026-11-12", {
      idempotencyKey: "conv-1",
    });
    const replay = await suite.createBooking("fx-harbor-suite", GUEST, "2026-11-10", "2026-11-12", {
      idempotencyKey: "conv-1",
    });
    assert.equal(replay.bookingCode, first.bookingCode);
    const other = await suite.createBooking("fx-harbor-suite", GUEST, "2026-11-10", "2026-11-12", {
      idempotencyKey: "conv-2",
    });
    assert.notEqual(other.bookingCode, first.bookingCode);
  });
});

describe("HTTP adapter errors", () => {
  it("maps 429 to rate_limited even with an empty body", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 429, json: async () => null }));
    const suite = new HttpSuiteAdapter({ baseUrl: "https://suite.test", secret: null, version: 1 });
    await assert.rejects(suite.lookupBookingByCode("ANY"), /rate_limited/);
  });
  it("keeps the 429 mapping when the body carries its own error", async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: "slow down" }),
    }));
    const suite = new HttpSuiteAdapter({ baseUrl: "https://suite.test", secret: null, version: 1 });
    await assert.rejects(suite.lookupBookingByCode("ANY"), /rate_limited/);
  });
  it("sends the idempotency key as a header on booking POSTs", async () => {
    let seen;
    globalThis.fetch = (async (_url, init) => {
      seen = init?.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ booking: { bookingCode: "RES-1", totalAmountPoisha: 100 } }),
      };
    });
    const suite = new HttpSuiteAdapter({ baseUrl: "https://suite.test", secret: "s3cr3t", version: 1 });
    await suite.createBooking("r1", GUEST, "2026-11-10", "2026-11-12", { idempotencyKey: "conv-9" });
    assert.equal(seen["Idempotency-Key"], "conv-9");
    assert.equal(seen.Authorization, "Bearer s3cr3t");
  });
});
