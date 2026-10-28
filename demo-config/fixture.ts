// Fixture Suite catalogue (multi-tenant core, TEST ONLY). Rooms for
// properties that run on the FixtureSuiteAdapter instead of HTTP —
// deterministic availability (always full), computed totals (same rate
// math as quotes), drafts in process memory. A property graduates to a
// real backend by leaving this registry (a deliberate commit) and gaining
// a binding row. Anything served from here is labeled FIXTURE in codes
// and docs — it must never be mistaken for a real booking.
//
// PRICE CONTRACT: basePricePoisha here MUST equal the RoomMapping rows the
// seed file writes for the same slugs. A mismatch does not corrupt
// anything — the draft tool surfaces it as a totals warning — but keep
// them in sync (see ROOMS in prisma/seed-tenants.mjs).

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
