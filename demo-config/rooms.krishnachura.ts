// DORMANT flip target for the Krishnachura catalogue (step 2a).
//
// Demo1's seed NOW defines Krishnachura Retreat's 5 theme rooms (see
// travel-scaffold@client/demo1 prisma/seed.ts), but the LIVE demo1 database
// still holds the generic rooms until `pnpm db:seed` runs against it.
// DO NOT import this file yet. After demo1 is re-seeded:
//   1. Copy this file over demo-config/rooms.ts (it is a complete
//      replacement: same exports, theme rooms).
//   2. Fill suiteRoomId from demo1's Supabase Room table (re-seeding
//      generates NEW UUIDs, so the old ones are invalid).
//   3. Restart dev / redeploy.
// Until then, demo-config/rooms.ts (generic rooms) matches the live DB.

export type DemoRoom = {
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
};

export const DEMO_ROOMS: DemoRoom[] = [
  { slug: "terracotta-villa", name: "Terracotta Villa", basePricePoisha: 1450000, suiteRoomId: "" },
  { slug: "bamboo-cottage", name: "Bamboo Cottage", basePricePoisha: 850000, suiteRoomId: "" },
  { slug: "clay-house-suite", name: "Clay House Suite", basePricePoisha: 980000, suiteRoomId: "" },
  { slug: "palm-loft", name: "Palm Loft", basePricePoisha: 720000, suiteRoomId: "" },
  { slug: "earth-lodge", name: "Earth Lodge", basePricePoisha: 1680000, suiteRoomId: "" },
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
