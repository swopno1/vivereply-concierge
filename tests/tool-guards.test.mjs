// Tool guard tests: the architecture's promises with a fake ToolDb and
// a stub Suite adapter — quote-first, one-draft, catalogue membership,
// date validity, and the resort-pay fail-closed gate. No database.
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
    claimDraft: async () => true,
    releaseDraftClaim: async () => {},
    getDraft: async () => null,
    createHandoff: async () => {},
    getResortPaymentLink: async () => ({
      paymentUrl: "https://resort.example.com/pay?booking=RES-1",
      bookingCode: "RES-1",
    }),
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
  it("answers in-progress when the claim is denied and no draft exists", async () => {
    let booked = 0;
    const out = await run(
      fakeDb({ hasQuote: async () => true, hasDraft: async () => false, claimDraft: async () => false }),
      stubSuite({ createBooking: async () => { booked += 1; throw new Error("must not book"); } })
    )(
      "create_booking_draft",
      JSON.stringify({ ...STAY, guestName: "A", guestEmail: "a@b.c", guestPhone: "1" })
    );
    assert.match(out.error, /already being created/);
    assert.equal(booked, 0);
  });
  it("answers already-held when the claim is denied but a draft landed", async () => {
    // First read: no draft (passes the guard). Denied claim. Second
    // read: the sibling's draft is now visible — the re-read path.
    let reads = 0;
    const out = await run(
      fakeDb({ hasQuote: async () => true, hasDraft: async () => ++reads > 1, claimDraft: async () => false }),
      stubSuite()
    )(
      "create_booking_draft",
      JSON.stringify({ ...STAY, guestName: "A", guestEmail: "a@b.c", guestPhone: "1" })
    );
    assert.match(out.error, /already holds a booking draft/);
    assert.equal(reads, 2);
  });
  it("offers a staff handoff when the Suite fails mid-flow", async () => {
    const down = new Error("The resort's system answered unexpectedly. Please try again.");
    const avail = await run(fakeDb(), stubSuite({ getAvailability: async () => { throw down; } }))(
      "get_quote",
      JSON.stringify(STAY)
    );
    assert.match(avail.error, /staff handoff/);
    const draft = await run(
      fakeDb({ hasQuote: async () => true }),
      stubSuite({ createBooking: async () => { throw down; } })
    )("create_booking_draft", JSON.stringify({ ...STAY, guestName: "A", guestEmail: "a@b.c", guestPhone: "1" }));
    assert.match(draft.error, /staff handoff/);
  });
  it("reports sold-out instead of quoting zero availability", async () => {
    const out = await run(fakeDb(), stubSuite({ getAvailability: async () => ({ available: 0 }) }))(
      "get_quote",
      JSON.stringify(STAY)
    );
    assert.match(out.error, /sold out/);
  });
});

describe("resort-pay gate", () => {
  it("fails closed when the resort set no payment page", async () => {
    const out = await run(fakeDb(), stubSuite(), CATALOGUE, { resortPay: false })(
      "get_resort_payment_link",
      "{}"
    );
    assert.match(out.error, /hasn't set up its payment page/);
    const def = await run(fakeDb(), stubSuite(), CATALOGUE)("get_resort_payment_link", "{}");
    assert.match(def.error, /hasn't set up its payment page/);
  });
  it("needs a draft even when the page is set", async () => {
    const out = await run(fakeDb({ hasDraft: async () => false }), stubSuite(), CATALOGUE, { resortPay: true })(
      "get_resort_payment_link",
      "{}"
    );
    assert.match(out.error, /no booking draft/i);
  });
  it("returns the server-built pointer verbatim with a draft", async () => {
    const out = await run(fakeDb({ hasDraft: async () => true }), stubSuite(), CATALOGUE, { resortPay: true })(
      "get_resort_payment_link",
      "{}"
    );
    assert.equal(out.paymentUrl, "https://resort.example.com/pay?booking=RES-1");
    assert.equal(out.bookingCode, "RES-1");
  });
});
