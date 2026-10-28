// Demo catalogue for the hackathon showcase — FLIPPED to Krishnachura
// Retreat on 2026-10-28 (post step 5). These are the 5 theme rooms in
// demo1's LIVE database (new demo1 Supabase DB, Krishnachura seed),
// with their suiteRoomId UUIDs copied from demo1's Supabase Room
// table by the founder on 2026-10-28, in this order:
//   Terracotta Villa, Bamboo Cottage, Clay House Suite, Palm Loft,
//   Earth Lodge.
// suiteRoomId is the Suite database UUID for the room. Room IDs are
// public identifiers (they appear in demo1's public API URLs), not
// secrets, so committing them here is safe. If demo1 is ever
// re-seeded, these UUIDs change and this file must be re-flipped.
// The quote the agent shows comes from here; the booking total comes
// from the Suite, which charges the same DB price — so quote and
// booking agree, and a mismatch is surfaced as a warning, never
// hidden.

export type DemoRoom = {
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
};

export const DEMO_ROOMS: DemoRoom[] = [
  { slug: "terracotta-villa", name: "Terracotta Villa", basePricePoisha: 1450000, suiteRoomId: "8accd111-64a4-4407-b2c6-2885057e5919" },
  { slug: "bamboo-cottage", name: "Bamboo Cottage", basePricePoisha: 850000, suiteRoomId: "de4ed2c6-34c7-44a2-b36f-c1b7f0647781" },
  { slug: "clay-house-suite", name: "Clay House Suite", basePricePoisha: 980000, suiteRoomId: "75a8db71-56d9-442a-b5b9-8efd1151868d" },
  { slug: "palm-loft", name: "Palm Loft", basePricePoisha: 720000, suiteRoomId: "9cb75e2a-a22f-4538-b4ef-120d30690bec" },
  { slug: "earth-lodge", name: "Earth Lodge", basePricePoisha: 1680000, suiteRoomId: "e43671ca-6b81-4eef-be53-c3d64dcec0e1" },
];

export function findRoomBySlug(slug: string): DemoRoom | undefined {
  return DEMO_ROOMS.find((r) => r.slug === slug);
}

/** One-line catalogue for the system prompt, so the model never invents a room or price. */
export function catalogueText(): string {
  return DEMO_ROOMS.map(
    (r) => `- ${r.name} (slug: ${r.slug}) — ৳${(r.basePricePoisha / 100).toLocaleString("en-US")} per night`
  ).join("\n");
}
