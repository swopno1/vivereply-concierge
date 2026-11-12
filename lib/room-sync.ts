// Room catalogue sync (Suite Handover D consumer). Fetches the booking
// system's published room list (GET {baseUrl}/api/concierge/rooms) and
// REPLACES the property's RoomMapping rows wholesale — in one
// transaction, only after the full response is fetched and validated.
// A failed or partial fetch changes nothing.
//
// Mapping (Handover D response -> row):
//   suiteRoomId = room.id · name = room.name · slug = room.slug when
//   present and valid, else the slugified name (deduped with -2, -3…)
//   · basePricePoisha = round(baseRate.amount × 100), BDT only
//   · highlights = room.amenities (first 6, sliced to 80 chars).
// `capacity` and `suiteVersion` are ignored in v1: RoomMapping has no
// capacity column, and shape validation (not the version number) is the
// gate. An empty rooms list syncs to zero rows — an honest mirror of a
// backend with no active rooms (manual re-add stays available).
//
// Pure mapping + injectable deps: the route injects the real Suite fetch
// and the real tx; tests inject stubs. No Prisma import here.

import { MAX_SLUG_LEN, SLUG_RE, isValidRoomSlug, slugifyRoomName } from "./room-slug";

// Row parity with the manual mappings API (cleanRoom): a synced row must
// always be one the owner could have typed. Amounts in poisha.
const MAX_NAME_LEN = 100;
const MAX_SUITE_ROOM_ID_LEN = 100;
const MAX_PRICE_POISHA = 100_000_000;
const MAX_HIGHLIGHTS = 6;
const MAX_HIGHLIGHT_LEN = 80;

export type SyncedRoom = {
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
  highlights: string[];
};

export type MappedCatalogue =
  | { ok: true; rooms: SyncedRoom[] }
  | { ok: false; error: string };

// Short diagnostic echoes (owner-visible): never paste unbounded Suite
// strings into messages.
function echo(value: unknown): string {
  if (typeof value === "string" && value) return value.slice(0, 40);
  return JSON.stringify(value)?.slice(0, 40) ?? "?";
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error: `${error} No rooms were changed.` };
}

function assignSlug(rawSlug: unknown, name: string, index: number, used: Set<string>): string {
  const candidate = typeof rawSlug === "string" ? rawSlug.trim() : "";
  let base =
    candidate && isValidRoomSlug(candidate) ? candidate : slugifyRoomName(name);
  if (!base || !SLUG_RE.test(base)) base = `room-${index + 1}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  for (;;) {
    // Truncation can cut right after a dash ("ab-" + "-2" is invalid),
    // so strip the stem and re-check; the growing suffix guarantees a
    // fresh, valid candidate exists and the loop terminates.
    const suffix = `-${i}`;
    i += 1;
    const stem = base.slice(0, MAX_SLUG_LEN - suffix.length).replace(/-+$/g, "") || "room";
    const next = `${stem}${suffix}`;
    if (!isValidRoomSlug(next)) continue;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
}

/** Validate + map a full /api/concierge/rooms payload. Never throws on data. */
export function mapSuiteRooms(payload: unknown): MappedCatalogue {
  const rooms = (payload as { rooms?: unknown } | null)?.rooms;
  if (!payload || typeof payload !== "object" || !Array.isArray(rooms)) {
    return fail("The booking system answered with room data I can't read (rooms list missing).");
  }
  const used = new Set<string>();
  const mapped: SyncedRoom[] = [];
  for (let index = 0; index < rooms.length; index += 1) {
    const room = rooms[index] as Record<string, unknown>;
    const label = `Room ${index + 1}`;
    if (!room || typeof room !== "object") {
      return fail(`${label} is not an object (${echo(room)}).`);
    }
    const suiteRoomId = typeof room.id === "string" ? room.id.trim() : "";
    if (!suiteRoomId) {
      return fail(`${label} has no usable room ID.`);
    }
    if (suiteRoomId.length > MAX_SUITE_ROOM_ID_LEN) {
      return fail(`${label} has a room ID longer than ${MAX_SUITE_ROOM_ID_LEN} characters.`);
    }
    const name = typeof room.name === "string" ? room.name.trim() : "";
    if (!name) {
      return fail(`${label} (${echo(suiteRoomId)}) has no usable name.`);
    }
    if (name.length > MAX_NAME_LEN) {
      return fail(`Room "${echo(name)}" has a name longer than ${MAX_NAME_LEN} characters.`);
    }
    const baseRate = room.baseRate as { amount?: unknown; currency?: unknown } | null;
    const amount = baseRate && typeof baseRate === "object" ? baseRate.amount : undefined;
    const currency = baseRate && typeof baseRate === "object" ? baseRate.currency : undefined;
    if (currency !== "BDT") {
      return fail(`Room "${name}" is priced in ${echo(currency)} — sync supports BDT rooms only.`);
    }
    // Currency first (the actionable error), then the amount.
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return fail(`Room "${name}" has an invalid nightly rate.`);
    }
    const basePricePoisha = Math.round(amount * 100);
    if (basePricePoisha < 1 || basePricePoisha > MAX_PRICE_POISHA) {
      return fail(`Room "${name}" has a nightly rate outside the syncable range.`);
    }
    const rawAmenities = room.amenities;
    const highlights = (Array.isArray(rawAmenities) ? rawAmenities : [])
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, MAX_HIGHLIGHTS)
      .map((a) => a.slice(0, MAX_HIGHLIGHT_LEN));
    mapped.push({
      slug: assignSlug(room.slug, name, index, used),
      name,
      basePricePoisha,
      suiteRoomId,
      highlights,
    });
  }
  return { ok: true, rooms: mapped };
}

export type RoomSyncDeps = {
  /** Raw GET {baseUrl}/api/concierge/rooms JSON (Suite errors throw). */
  fetchRooms: () => Promise<unknown>;
  /** Wholesale replace, in ONE transaction (the route owns atomicity). */
  replaceAll: (rooms: SyncedRoom[]) => Promise<number>;
};

export type RoomSyncResult = { ok: true; count: number } | { ok: false; error: string };

/** Fetch, validate, then replace — validation failure never reaches replaceAll. */
export async function syncRoomCatalogue(deps: RoomSyncDeps): Promise<RoomSyncResult> {
  let payload: unknown;
  try {
    payload = await deps.fetchRooms();
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // The D endpoint never legitimately 404s (an empty catalogue is []),
    // so a 404 here means an older Suite without the endpoint.
    if (message === "not found") {
      return {
        ok: false,
        error: "Your booking system doesn't offer automatic room sync yet — add rooms manually below.",
      };
    }
    if (message === "rate_limited") {
      return { ok: false, error: "The booking system is busy — try again in a moment. No rooms were changed." };
    }
    return { ok: false, error: message || "The booking system did not answer. No rooms were changed." };
  }
  const mapped = mapSuiteRooms(payload);
  if (!mapped.ok) return mapped;
  const count = await deps.replaceAll(mapped.rooms);
  return { ok: true, count };
}
