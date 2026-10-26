// Demo catalogue for the hackathon showcase (step 2a).
//
// These are the rooms in demo1's LIVE database TODAY (from travel-scaffold's
// old prisma/seed.ts on client/demo1), with their seed prices. The quote the
// agent shows comes from here; the booking total comes from the Suite,
// which charges the same DB price — so quote and booking agree.
//
// NOTE: demo1's seed has since been rewritten to Krishnachura Retreat's 5
// theme rooms, but the live DB still holds these generic rooms until
// `pnpm db:seed` runs against it. When that happens, swap in
// demo-config/rooms.krishnachura.ts (same shape) and re-copy the UUIDs —
// re-seeding generates new ones. Until then, this file is the truth.
// DO NOT rename rooms or change prices here without changing the Suite seed.
//
// suiteRoomId is the Suite database UUID for the room. It is NOT in the
// repo (seed-generated). Fill it from demo1's Supabase Table Editor
// (Room table, copy the id for each slug). While empty, tools for that
// room fail with a clear configuration error instead of inventing data.

export type DemoRoom = {
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
};

export const DEMO_ROOMS: DemoRoom[] = [
  { slug: "coxs-bazar-oceanfront-deluxe", name: "Oceanfront Deluxe Room", basePricePoisha: 1250000, suiteRoomId: "" },
  { slug: "coxs-bazar-sunset-royal-villa", name: "Sunset Royal Beach Villa", basePricePoisha: 2200000, suiteRoomId: "" },
  { slug: "sajek-cloud-view-wooden-cottage", name: "Cloud View Wooden Cottage", basePricePoisha: 850000, suiteRoomId: "" },
  { slug: "sreemangal-executive-tea-view", name: "Executive Tea Garden View Room", basePricePoisha: 1050000, suiteRoomId: "" },
  { slug: "sreemangal-presidential-golf-suite", name: "Presidential Golf Suite", basePricePoisha: 2800000, suiteRoomId: "" },
  { slug: "sundarbans-mangrove-safari-cabin", name: "Mangrove Safari Cabin", basePricePoisha: 750000, suiteRoomId: "" },
  { slug: "saint-martins-coral-view-cottage", name: "Coral View Beach Cottage", basePricePoisha: 950000, suiteRoomId: "" },
  { slug: "kuakata-horizon-sunrise-room", name: "Horizon Sunrise Room", basePricePoisha: 650000, suiteRoomId: "" },
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
