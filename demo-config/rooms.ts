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

// Highlights are copied VERBATIM from demo1's seed amenities
// (travel-scaffold@client/demo1 prisma/seed.ts), two per room, so the
// agent can match a guest's wish ("sea-facing", "garden", "fire pit")
// to a real room without inventing anything. Only Terracotta Villa
// has a sea view in the seed — that is why a sea-facing ask maps to
// it, and to nothing else.
export type DemoRoom = {
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
  highlights: string[];
};

export const DEMO_ROOMS: DemoRoom[] = [
  { slug: "terracotta-villa", name: "Terracotta Villa", basePricePoisha: 1450000, suiteRoomId: "8accd111-64a4-4407-b2c6-2885057e5919", highlights: ["Sea-view terrace", "Private plunge pool"] },
  { slug: "bamboo-cottage", name: "Bamboo Cottage", basePricePoisha: 850000, suiteRoomId: "de4ed2c6-34c7-44a2-b36f-c1b7f0647781", highlights: ["Outdoor soaking tub", "Private garden"] },
  { slug: "clay-house-suite", name: "Clay House Suite", basePricePoisha: 980000, suiteRoomId: "75a8db71-56d9-442a-b5b9-8efd1151868d", highlights: ["Courtyard access", "Fire pit evenings"] },
  { slug: "palm-loft", name: "Palm Loft", basePricePoisha: 720000, suiteRoomId: "9cb75e2a-a22f-4538-b4ef-120d30690bec", highlights: ["Hammock balcony", "Treetop views"] },
  { slug: "earth-lodge", name: "Earth Lodge", basePricePoisha: 1680000, suiteRoomId: "e43671ca-6b81-4eef-be53-c3d64dcec0e1", highlights: ["Private kitchen garden", "Shaded veranda"] },
];

export function findRoomBySlug(slug: string): DemoRoom | undefined {
  return DEMO_ROOMS.find((r) => r.slug === slug);
}

/** One-line catalogue for the system prompt, so the model never invents a room or price.
 * Highlights are included so the model can match a guest's wish to a real room. */
export function catalogueText(rooms: DemoRoom[] = DEMO_ROOMS): string {
  return rooms.map(
    (r) => `- ${r.name} (slug: ${r.slug}) — ৳${(r.basePricePoisha / 100).toLocaleString("en-US")} per night — ${r.highlights.join(", ")}`
  ).join("\n");
}

// Per-property catalogue (adapter Phase 3). Rows win when present; the demo
// property falls back to this file until it is seeded; any other property
// without rows fails honestly instead of borrowing the demo's rooms.
export async function catalogueForProperty(propertyId: string): Promise<DemoRoom[]> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.roomMapping.findMany({
    where: { propertyId },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length > 0) {
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      basePricePoisha: r.basePricePoisha,
      suiteRoomId: r.suiteRoomId,
      highlights: r.highlights,
    }));
  }
  if (propertyId === (process.env.DEMO_PROPERTY_ID ?? "krishnachura-retreat")) {
    return DEMO_ROOMS;
  }
  throw new Error(`Property "${propertyId}" has no room catalogue yet.`);
}

export type CatalogueSource = "settings" | "demo-file" | "none";

// Read-only mirror of catalogueForProperty's decision for the Settings
// status banner. Keep in sync with the resolver above.
export async function describeCatalogueResolution(
  propertyId: string
): Promise<{ source: CatalogueSource; rooms: number }> {
  const { prisma } = await import("@/lib/prisma");
  const count = await prisma.roomMapping.count({ where: { propertyId } });
  if (count > 0) return { source: "settings", rooms: count };
  if (propertyId === (process.env.DEMO_PROPERTY_ID ?? "krishnachura-retreat")) {
    return { source: "demo-file", rooms: DEMO_ROOMS.length };
  }
  return { source: "none", rooms: 0 };
}
