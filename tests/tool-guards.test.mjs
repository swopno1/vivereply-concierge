// Tool guard tests: the architecture's promises with a fake ToolDb and
// a stub Suite adapter — quote-first, one-draft, catalogue membership,
// date validity, and the payments fail-closed gate. No database.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createToolExecutor } from "@/lib/tools";

const CATALOGUE = [
  { slug: "test-villa", name: "Test Villa", basePricePoisha: 1450000, suiteRoomId: "suite-1", highlights: ["Sea view"] },
  { slug: "unwired-room", name: "Unwired Room", basePricePoisha: 500000, suiteRoomId: "", highlights: [] },
];

const STAY = { roomSlug: "test-villa", checkIn: "2026-11-10", checkOut: "2026-11-12" };

function fakeDb(over = {}) {
  return {
    hasQuote: async () => false,
    hasDraft: async () => false,
    getDraft: async () => null,
    createHandoff: async () => {},
    createPaymentLink: async () => {
      throw new Error("unexpected mint");
    },
    getPaymentStatus: async () => ({ found: false }),
    ...over,
  };
}

function stubSuite(over = {}) {
  return {
    getAvailability: async () => ({ available: 2 }),
    createBooking: async () => ({ id: "b1", bookingCode: "RES-TEST-1", totalAmountPoisha: 2900000 }),
    lookupBookingByCode: async () => ({ bookingCode: "x", firstName: "y", checkIn: "a", checkOut: "b", status: "PENDING" }),
    requestBookingDetails: async () => ({ sent: true }),
    ping: async () => ({ ok: true, suiteVersion: 1 }),
    ...over,
  };
}

const run = (db, suite, catalogue = CATALOGUE, opts) =>
  createToolExecutor("conv-test", db, suite, catalogue, opts);

describe("argument guards", () => {
  it("rejects invalid JSON", async () => {
    const out = await run(fakeDb(), stubSuite())("get_quote", "{nope");
    assert.match(out.error, /Invalid tool arguments/);
  });
  it("rejects vague dates", async () => {
    const out = await run(fakeDb(), stubSuite())("get_quote", JSON.stringify({ ...STAY, checkIn: "soon" }));
    assert.match(out.error, /YYYY-MM-DD/);
  });
  it("rejects unknown rooms and unwired rooms", async () => {
    const noRoom = await run(fakeDb(), stubSuite())("get_quote", JSON.stringify({ ...STAY, roomSlug: "nope" }));
    assert.match(noRoom.error, /not in the catalogue/);
    const unwired = await run(fakeDb(), stubSuite())("get_quote", JSON.stringify({ ...STAY, roomSlug: "unwired-room" }));
    assert.match(unwired.error, /not connected to live availability/);
  });
});

describe("quote-first + one-draft", () => {
  it("refuses a draft before its quote", async () => {
    const out = await run(fakeDb({ hasQuote: async () => false }), stubSuite())(
      "create_booking_draft",
      JSON.stringify({ ...STAY, guestName: "A", guestEmail: "a@b.c", guestPhone: "1" })
    );
    assert.match(out.error, /quote.*first/i);
  });
  it("refuses a second draft in one conversation", async () => {
    const out = await run(fakeDb({ hasQuote: async () => true, hasDraft: async () => true }), stubSuite())(
      "create_booking_draft",
      JSON.stringify({ ...STAY, guestName: "A", guestEmail: "a@b.c", guestPhone: "1" })
    );
    assert.match(out.error, /already holds a booking draft/);
  });
  it("drafts when quoted, matching the Suite total", async () => {
    const out = await run(fakeDb({ hasQuote: async () => true }), stubSuite())(
      "create_booking_draft",
      JSON.stringify({ ...STAY, guestName: "A", guestEmail: "a@b.c", guestPhone: "1" })
    );
    assert.equal(out.bookingCode, "RES-TEST-1");
    assert.equal(out.totalsMatch, true);
  });
  it("reports sold-out instead of quoting zero availability", async () => {
    const out = await run(fakeDb(), stubSuite({ getAvailability: async () => ({ available: 0 }) }))(
      "get_quote",
      JSON.stringify(STAY)
    );
    assert.match(out.error, /sold out/);
  });
});

describe("payments gate", () => {
  it("fails closed when the turn takes no payments", async () => {
    const link = await run(fakeDb(), stubSuite(), CATALOGUE, { payments: false })(
      "create_payment_link",
      JSON.stringify({ method: "stripe" })
    );
    assert.match(link.error, /not enabled/);
    const st = await run(fakeDb(), stubSuite(), CATALOGUE) ("check_payment_status", "{}");
    assert.match(st.error, /not enabled/);
  });
  it("needs a draft even when payments are on", async () => {
    const out = await run(fakeDb({ hasDraft: async () => false }), stubSuite(), CATALOGUE, { payments: true })(
      "create_payment_link",
      JSON.stringify({ method: "stripe" })
    );
    assert.match(out.error, /no booking draft/i);
  });
});
