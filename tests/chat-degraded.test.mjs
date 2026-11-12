// Degraded-chat tests: guest chat must survive a missing or unusable
// booking backend. Resolution never ends the turn (fail-soft); tools
// gate by their real dependencies (definitions AND executor); the
// model is told not to invent prices/availability; and the owner gets
// exactly one failure entry per degraded turn. No database.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  BACKEND_FAILURE_TOOL_NAMES,
  RESOLUTION_TOOL_NAME,
  isFailureOutput,
  resolutionFailureRow,
  resolveBookingMode,
} from "@/lib/booking-mode";
import { createToolExecutor, toolDefinitionsFor } from "@/lib/tools";
import { systemPrompt } from "@/lib/prompts";

const CATALOGUE = [
  { slug: "test-villa", name: "Test Villa", basePricePoisha: 1450000, suiteRoomId: "suite-1", highlights: ["Sea view"] },
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

const defNames = (defs) => defs.map((d) => d.function.name).sort();

describe("resolveBookingMode", () => {
  it("serves fully when backend + catalogue resolve", async () => {
    const mode = await resolveBookingMode("prop-1", {
      resolveSuite: async () => stubSuite(),
      resolveCatalogue: async () => CATALOGUE,
    });
    assert.equal(mode.hasSuite, true);
    assert.equal(mode.hasCatalogue, true);
    assert.equal(mode.degradedReason, null);
    assert.ok(mode.suite !== null);
    assert.equal(mode.catalogue.length, 1);
  });
  it("fail-softs when NOTHING resolves: nulls + one combined reason, never throws", async () => {
    const mode = await resolveBookingMode("krishnachura-retreat-265791", {
      resolveSuite: async () => { throw new Error('Property "x" is not connected to a booking backend.'); },
      resolveCatalogue: async () => { throw new Error('Property "x" has no room catalogue yet.'); },
    });
    assert.equal(mode.suite, null);
    assert.deepEqual(mode.catalogue, []);
    assert.equal(mode.hasSuite, false);
    assert.equal(mode.hasCatalogue, false);
    assert.match(mode.degradedReason, /not connected to a booking backend/);
    assert.match(mode.degradedReason, /no room catalogue yet/);
  });
  it("keeps the suite when only the catalogue fails", async () => {
    const suite = stubSuite();
    const mode = await resolveBookingMode("prop-1", {
      resolveSuite: async () => suite,
      resolveCatalogue: async () => { throw new Error('Property "prop-1" has no room catalogue yet.'); },
    });
    assert.equal(mode.suite, suite);
    assert.equal(mode.hasSuite, true);
    assert.equal(mode.hasCatalogue, false);
    assert.match(mode.degradedReason, /no room catalogue yet/);
  });
  it("keeps the catalogue when only the suite fails", async () => {
    const mode = await resolveBookingMode("prop-1", {
      resolveSuite: async () => { throw new Error('Property "prop-1" is not connected to a booking backend.'); },
      resolveCatalogue: async () => CATALOGUE,
    });
    assert.equal(mode.suite, null);
    assert.equal(mode.hasSuite, false);
    assert.equal(mode.hasCatalogue, true);
    assert.equal(mode.catalogue.length, 1);
  });
  it("treats an empty catalogue array as missing (nothing usable)", async () => {
    const mode = await resolveBookingMode("prop-1", {
      resolveSuite: async () => stubSuite(),
      resolveCatalogue: async () => [],
    });
    assert.equal(mode.hasSuite, true);
    assert.equal(mode.hasCatalogue, false);
    assert.match(mode.degradedReason, /no room catalogue yet/);
  });
  it("fail-softs on unexpected throws AND non-Error throws, leaking nothing", async () => {
    const dbErr = await resolveBookingMode("prop-1", {
      resolveSuite: async () => { throw new Error("connect ECONNREFUSED 10.0.0.9:5432 password=hunter2"); },
      resolveCatalogue: async () => CATALOGUE,
    });
    assert.equal(dbErr.hasSuite, false);
    assert.ok(!dbErr.degradedReason.includes("ECONNREFUSED"));
    assert.ok(!dbErr.degradedReason.includes("hunter2"));
    const weird = await resolveBookingMode("prop-1", {
      resolveSuite: async () => stubSuite(),
      // eslint-disable-next-line no-throw-literal
      resolveCatalogue: async () => { throw "string-throw"; },
    });
    assert.equal(weird.hasCatalogue, false);
    assert.equal(typeof weird.degradedReason, "string");
  });
});

describe("toolDefinitionsFor degraded filtering", () => {
  it("no suite → request_handoff ONLY (never resort-pay, even if asked)", () => {
    const names = defNames(toolDefinitionsFor(CATALOGUE, { resortPay: true, hasSuite: false, hasCatalogue: true }));
    assert.deepEqual(names, ["request_handoff"]);
  });
  it("suite without catalogue → suite-only tools + handoff, catalogue trio gone", () => {
    const names = defNames(toolDefinitionsFor(CATALOGUE, { hasSuite: true, hasCatalogue: false }));
    assert.deepEqual(
      names,
      ["lookup_booking_by_code", "request_booking_details", "request_handoff", "verify_booking"]
    );
  });
  it("full mode unchanged: all seven, payment link only on resortPay", () => {
    assert.deepEqual(
      defNames(toolDefinitionsFor(CATALOGUE, { hasSuite: true, hasCatalogue: true })),
      [
        "check_availability",
        "create_booking_draft",
        "get_quote",
        "lookup_booking_by_code",
        "request_booking_details",
        "request_handoff",
        "verify_booking",
      ]
    );
    assert.ok(
      defNames(toolDefinitionsFor(CATALOGUE, { resortPay: true })).includes("get_resort_payment_link")
    );
    assert.ok(
      !defNames(toolDefinitionsFor(CATALOGUE)).includes("get_resort_payment_link")
    );
  });
});

describe("executor degraded gate", () => {
  const BOOKING_TOOLS = [
    "check_availability",
    "get_quote",
    "create_booking_draft",
    "verify_booking",
    "lookup_booking_by_code",
    "request_booking_details",
    "get_resort_payment_link",
  ];
  it("no suite → every booking tool returns {error} with handoff instruction, never throws", async () => {
    const exec = createToolExecutor("conv-1", fakeDb(), null, [], {
      resortPay: true,
      hasSuite: false,
      hasCatalogue: false,
    });
    for (const name of BOOKING_TOOLS) {
      const out = await exec(name, JSON.stringify({ ...STAY, code: "RES-1", email: "a@b.c" }));
      assert.equal(typeof out.error, "string", name);
      assert.match(out.error, /being set up/, name);
      assert.match(out.error, /request_handoff/, name);
    }
  });
  it("no suite → request_handoff still works", async () => {
    let handed = 0;
    const exec = createToolExecutor("conv-1", fakeDb({ createHandoff: async () => { handed += 1; } }), null, [], {
      hasSuite: false,
      hasCatalogue: false,
    });
    const out = await exec("request_handoff", JSON.stringify({ reason: "r", summary: "s" }));
    assert.equal(out.handedOff, true);
    assert.equal(handed, 1);
  });
  it("suite without catalogue → suite tools serve, catalogue trio gated", async () => {
    const suite = stubSuite();
    const exec = createToolExecutor("conv-1", fakeDb(), suite, [], {
      hasSuite: true,
      hasCatalogue: false,
    });
    const lookup = await exec("lookup_booking_by_code", JSON.stringify({ code: "RES-1" }));
    assert.equal(lookup.bookingCode, "x");
    for (const name of ["check_availability", "get_quote", "create_booking_draft"]) {
      const out = await exec(name, JSON.stringify(STAY));
      assert.match(out.error, /being set up/, name);
    }
  });
  it("a null adapter can never dereference, even if flags lie", async () => {
    const exec = createToolExecutor("conv-1", fakeDb(), null, CATALOGUE, {
      hasSuite: true,
      hasCatalogue: true,
    });
    const out = await exec("lookup_booking_by_code", JSON.stringify({ code: "RES-1" }));
    assert.equal(typeof out.error, "string");
  });
});

describe("systemPrompt degraded block", () => {
  it("tells the model the constraints in both languages", () => {
    for (const lang of ["en", "bn"]) {
      const p = systemPrompt(lang, null, CATALOGUE, null, { degraded: true });
      assert.ok(p.includes("BOOKING OFFLINE"), lang);
      assert.match(p, /do not quote prices or availability/i, lang);
      assert.match(p, /do not offer to book/i, lang);
      assert.ok(p.includes("request_handoff"), lang);
    }
  });
  it("stays silent when not degraded (existing turns byte-identical)", () => {
    for (const lang of ["en", "bn"]) {
      const p = systemPrompt(lang, null, CATALOGUE, null, { resortPay: false });
      assert.ok(!p.includes("BOOKING OFFLINE"), lang);
    }
  });
});

describe("owner failure signal", () => {
  it("the resolution row passes the backend-failures feed filter", () => {
    assert.ok(BACKEND_FAILURE_TOOL_NAMES.includes(RESOLUTION_TOOL_NAME));
    const row = resolutionFailureRow("conv-1", 'Property "x" is not connected to a booking backend.');
    assert.equal(row.conversationId, "conv-1");
    assert.equal(row.toolName, RESOLUTION_TOOL_NAME);
    assert.equal(isFailureOutput(row.output), true);
    assert.match(row.output.error, /not connected/);
  });
  it("the feed filter rejects non-error outputs", () => {
    assert.equal(isFailureOutput(null), false);
    assert.equal(isFailureOutput({}), false);
    assert.equal(isFailureOutput({ error: 42 }), false);
  });
});
