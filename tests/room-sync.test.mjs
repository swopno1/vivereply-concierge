// Room-sync tests: the Suite's published catalogue maps to rows by the
// Handover D contract, and only a fully fetched + validated response
// ever reaches the wholesale replace. The Suite is a stub (Handover D
// PRs are open, not landed); the route wires the real fetch + tx.
// No database, no network.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mapSuiteRooms, syncRoomCatalogue } from "@/lib/room-sync";

const ROOM = {
  id: "b3423051-9bd1-4bb2-a055-3547b050554d",
  name: "Terracotta Villa",
  slug: "terracotta-villa",
  capacity: 3,
  baseRate: { amount: 14500, currency: "BDT" },
  amenities: ["Sea-view terrace", "Private plunge pool"],
  active: true,
};

const payload = (rooms) => ({ suiteVersion: 1, rooms });

describe("mapSuiteRooms", () => {
  it("maps every field by the contract (poisha math included)", () => {
    const out = mapSuiteRooms(payload([ROOM]));
    assert.equal(out.ok, true);
    assert.deepEqual(out.rooms, [
      {
        slug: "terracotta-villa",
        name: "Terracotta Villa",
        basePricePoisha: 1450000,
        suiteRoomId: "b3423051-9bd1-4bb2-a055-3547b050554d",
        highlights: ["Sea-view terrace", "Private plunge pool"],
      },
    ]);
  });
  it("rounds fractional taka to poisha", () => {
    const out = mapSuiteRooms(payload([{ ...ROOM, baseRate: { amount: 14500.5, currency: "BDT" } }]));
    assert.equal(out.ok, true);
    assert.equal(out.rooms[0].basePricePoisha, 1450050);
  });
  it("slugifies the name when the slug is missing or invalid", () => {
    const missing = mapSuiteRooms(payload([{ ...ROOM, slug: undefined }]));
    assert.equal(missing.rooms[0].slug, "terracotta-villa");
    const invalid = mapSuiteRooms(payload([{ ...ROOM, slug: "Terracotta Villa!" }]));
    assert.equal(invalid.rooms[0].slug, "terracotta-villa");
    const numeric = mapSuiteRooms(payload([{ ...ROOM, slug: 42 }]));
    assert.equal(numeric.rooms[0].slug, "terracotta-villa");
  });
  it("dedupes slugs with a numeric suffix", () => {
    const out = mapSuiteRooms(payload([ROOM, { ...ROOM, id: "other-id" }, { ...ROOM, id: "third-id", slug: undefined }]));
    assert.deepEqual(out.rooms.map((r) => r.slug), ["terracotta-villa", "terracotta-villa-2", "terracotta-villa-3"]);
  });
  it("falls back to room-N when the name slugifies to nothing", () => {
    const out = mapSuiteRooms(payload([{ ...ROOM, name: "!!!", slug: undefined }]));
    assert.equal(out.ok, true);
    assert.equal(out.rooms[0].slug, "room-1");
  });
  it("keeps long slugs within 60 chars and valid", () => {
    const long = `x${"y".repeat(70)}-tail`;
    const out = mapSuiteRooms(payload([{ ...ROOM, name: long, slug: undefined }]));
    assert.equal(out.ok, true);
    assert.ok(out.rooms[0].slug.length <= 60);
    assert.match(out.rooms[0].slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
  it("rejects non-BDT rooms with the rows-untouched line", () => {
    const out = mapSuiteRooms(payload([{ ...ROOM, baseRate: { amount: 100, currency: "USD" } }]));
    assert.equal(out.ok, false);
    assert.match(out.error, /priced in USD/);
    assert.match(out.error, /BDT rooms only/);
    assert.match(out.error, /No rooms were changed/);
  });
  it("rejects bad ids, names, and rates", () => {
    for (const bad of [
      { ...ROOM, id: "  " },
      { ...ROOM, name: "  " },
      { ...ROOM, name: "x".repeat(101) },
      { ...ROOM, baseRate: { amount: 0, currency: "BDT" } },
      { ...ROOM, baseRate: { amount: -5, currency: "BDT" } },
      { ...ROOM, baseRate: { amount: NaN, currency: "BDT" } },
      { ...ROOM, baseRate: { amount: 2000000, currency: "BDT" } },
      { ...ROOM, baseRate: null },
      { ...ROOM, id: "x".repeat(101) },
    ]) {
      const out = mapSuiteRooms(payload([bad]));
      assert.equal(out.ok, false, JSON.stringify(bad).slice(0, 80));
      assert.match(out.error, /No rooms were changed/);
    }
  });
  it("rejects garbage payloads", () => {
    for (const bad of [null, {}, { rooms: null }, { rooms: "x" }, [{ ...ROOM, name: 42 }]]) {
      const rooms = Array.isArray(bad) ? bad : bad?.rooms;
      const out = Array.isArray(bad) ? mapSuiteRooms({ rooms }) : mapSuiteRooms(bad);
      assert.equal(out.ok, false, JSON.stringify(rooms)?.slice(0, 60));
    }
  });
  it("trims highlights to 6 x 80 chars instead of failing the sync", () => {
    const out = mapSuiteRooms(
      payload([{ ...ROOM, amenities: ["a", "b", "c", "d", "e", "f", "g", `h${"i".repeat(100)}`, 42, null] }])
    );
    assert.equal(out.ok, true);
    assert.deepEqual(out.rooms[0].highlights, ["a", "b", "c", "d", "e", "f"]);
  });
  it("treats missing amenities as empty and ignores capacity/version", () => {
    const out = mapSuiteRooms({ rooms: [{ ...ROOM, amenities: undefined, capacity: 99 }] });
    assert.equal(out.ok, true);
    assert.deepEqual(out.rooms[0].highlights, []);
  });
  it("mirrors an empty catalogue to zero rows (honest, not an error)", () => {
    const out = mapSuiteRooms(payload([]));
    assert.equal(out.ok, true);
    assert.deepEqual(out.rooms, []);
  });
});

describe("syncRoomCatalogue", () => {
  it("replaces wholesale in ONE call after a full fetch", async () => {
    const calls = [];
    const out = await syncRoomCatalogue({
      fetchRooms: async () => payload([ROOM, { ...ROOM, id: "id-2", name: "Second Room", slug: "second-room" }]),
      replaceAll: async (rooms) => {
        calls.push(rooms);
        return rooms.length;
      },
    });
    assert.deepEqual(out, { ok: true, count: 2 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 2);
  });
  it("never touches rows when validation fails", async () => {
    let replaced = 0;
    const out = await syncRoomCatalogue({
      fetchRooms: async () => payload([{ ...ROOM, baseRate: { amount: 10, currency: "USD" } }]),
      replaceAll: async () => {
        replaced += 1;
        return 0;
      },
    });
    assert.equal(out.ok, false);
    assert.equal(replaced, 0);
  });
  it("answers an older Suite (404) with the manual-add line", async () => {
    const out = await syncRoomCatalogue({
      fetchRooms: async () => {
        throw new Error("not found");
      },
      replaceAll: async () => 0,
    });
    assert.equal(out.ok, false);
    assert.equal(out.error, "Your booking system doesn't offer automatic room sync yet — add rooms manually below.");
  });
  it("surfaces other fetch failures plainly", async () => {
    const busy = await syncRoomCatalogue({
      fetchRooms: async () => {
        throw new Error("rate_limited");
      },
      replaceAll: async () => 0,
    });
    assert.match(busy.error, /busy/);
    const down = await syncRoomCatalogue({
      fetchRooms: async () => {
        throw new Error("Suite responded 500");
      },
      replaceAll: async () => 0,
    });
    assert.match(down.error, /Suite responded 500/);
  });
});
