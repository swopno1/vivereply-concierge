// Test-local Suite fixture (moved out of product code by the demo
// purge — product code must never serve a fixture backend). Same
// SuiteAdapter contract, no HTTP: deterministic availability (rooms
// always full), totals from the SAME quoteForStay math as the quote
// tool (so fixture drafts always match their quotes), drafts kept in
// process memory under FIX- codes. Drafts do NOT survive a restart —
// lookup afterwards answers "not found" honestly. Details delivery is
// a stub ({ sent: true } — a fixture cannot email). Anything this
// adapter touches is labeled FIXTURE — it must never be mistaken for
// a real booking.
//
// PRICE CONTRACT: basePricePoisha here MUST equal the RoomMapping rows
// the seed file writes for the same slugs. A mismatch does not corrupt
// anything — the draft tool surfaces it as a totals warning — but keep
// them in sync (see the seabreeze tenant in prisma/seed-tenants.mjs).

import type {
  Availability,
  BookingDraft,
  BookingGuest,
  BookingLookup,
  SuiteAdapter,
} from "@/lib/suite";
import { SUITE_API_VERSION } from "@/lib/suite";
import { isDateString, nightsBetween, quoteForStay } from "@/demo-config/rates";

export type FixtureRoom = {
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
  highlights: string[];
  units: string[];
};

export const FIXTURE_CATALOGUE: Record<string, FixtureRoom[]> = {
  "seabreeze-test": [
    {
      slug: "harbor-suite",
      name: "Harbor Suite",
      basePricePoisha: 1250000,
      suiteRoomId: "fx-harbor-suite",
      highlights: ["Harbor-view balcony", "King bed"],
      units: ["HS-1", "HS-2"],
    },
    {
      slug: "dune-room",
      name: "Dune Room",
      basePricePoisha: 680000,
      suiteRoomId: "fx-dune-room",
      highlights: ["Dune garden access", "Rain shower"],
      units: ["DR-1", "DR-2", "DR-3"],
    },
  ],
};

export function fixtureRoomsFor(propertyId: string): FixtureRoom[] | undefined {
  return FIXTURE_CATALOGUE[propertyId];
}

const fixtureDrafts = new Map<string, { firstName: string; checkIn: string; checkOut: string }>();
// Fixture idempotency ledger: same property + key replays the SAME
// draft instead of minting a second — the in-memory mirror of the
// Idempotency-Key contract real Suites implement (suite-api-spec.md).
const fixtureIdemKeys = new Map<string, BookingDraft>();
let fixtureCounter = 0;

export class FixtureSuiteAdapter implements SuiteAdapter {
  constructor(private propertyId: string) {}

  private room(roomId: string) {
    const room = fixtureRoomsFor(this.propertyId)?.find((r) => r.suiteRoomId === roomId);
    if (!room) throw new Error("not found");
    return room;
  }

  async getAvailability(roomId: string, checkIn: string, checkOut: string): Promise<Availability> {
    const room = this.room(roomId);
    if (!isDateString(checkIn) || !isDateString(checkOut) || nightsBetween(checkIn, checkOut) < 1) {
      throw new Error("Check-out must be after check-in.");
    }
    return { available: room.units.length, units: [...room.units] };
  }

  async createBooking(
    roomId: string,
    guest: BookingGuest,
    checkIn: string,
    checkOut: string,
    opts?: { idempotencyKey?: string; terms?: { accepted: boolean; version: string } }
  ): Promise<BookingDraft> {
    if (opts?.terms?.accepted !== true || !opts.terms.version) {
      throw new Error("Terms confirmation is required before drafting a booking.");
    }
    const room = this.room(roomId);
    if (!guest.guestName.trim() || !guest.guestEmail.trim() || !guest.guestPhone.trim()) {
      throw new Error("Guest name, email, and phone are required.");
    }
    const quote = quoteForStay(room.basePricePoisha, checkIn, checkOut);
    if (quote.nights < 1) throw new Error("Check-out must be after check-in.");
    if (opts?.idempotencyKey) {
      const replay = fixtureIdemKeys.get(`${this.propertyId}:${opts.idempotencyKey}`);
      if (replay) return replay;
    }
    fixtureCounter += 1;
    const bookingCode = `FIX-${Date.now().toString(36).toUpperCase()}-${fixtureCounter.toString(36).toUpperCase()}`;
    const firstName = guest.guestName.trim().split(/\s+/)[0] ?? guest.guestName.trim();
    fixtureDrafts.set(`${this.propertyId}:${bookingCode}`, { firstName, checkIn, checkOut });
    const draft = { id: bookingCode, bookingCode, totalAmountPoisha: quote.totalPoisha };
    if (opts?.idempotencyKey) {
      fixtureIdemKeys.set(`${this.propertyId}:${opts.idempotencyKey}`, draft);
    }
    return draft;
  }

  async lookupBookingByCode(code: string): Promise<BookingLookup> {
    const draft = fixtureDrafts.get(`${this.propertyId}:${code}`);
    if (!draft) throw new Error("not found");
    return {
      bookingCode: code,
      firstName: draft.firstName,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      status: "PENDING",
    };
  }

  async requestBookingDetails(_contact: { email?: string; phone?: string }): Promise<{ sent: boolean }> {
    return { sent: true };
  }

  async ping(): Promise<{ ok: boolean; suiteVersion: number }> {
    return { ok: true, suiteVersion: SUITE_API_VERSION };
  }
}
