// Per-property room catalogue (adapter Phase 3). Rows win, full stop:
// RoomMapping rows are the catalogue, and a property without rows has
// no catalogue (guest chat then degrades per the booking-mode rules —
// it answers questions but can't quote or book). No property is
// special; there is no file fallback and no demo catalogue.
export type DemoRoom = {
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
  highlights: string[];
};

/** One-line catalogue for the system prompt, so the model never invents a room or price.
 * Highlights are included so the model can match a guest's wish to a real room. */
export function catalogueText(rooms: DemoRoom[]): string {
  return rooms.map(
    (r) => `- ${r.name} (slug: ${r.slug}) — ৳${(r.basePricePoisha / 100).toLocaleString("en-US")} per night — ${r.highlights.join(", ")}`
  ).join("\n");
}

export async function catalogueForProperty(propertyId: string): Promise<DemoRoom[]> {
  const { withTenant } = await import("@/lib/tenant-db");
  const rows = await withTenant(propertyId, (tx) =>
    tx.roomMapping.findMany({
      where: { propertyId },
      orderBy: { createdAt: "asc" },
    })
  );
  if (rows.length > 0) {
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      basePricePoisha: r.basePricePoisha,
      suiteRoomId: r.suiteRoomId,
      highlights: r.highlights,
    }));
  }
  throw new Error(`Property "${propertyId}" has no room catalogue yet.`);
}

export type CatalogueSource = "settings" | "none";

// Read-only mirror of catalogueForProperty's decision for the Settings
// status banner. Keep in sync with the resolver above.
export async function describeCatalogueResolution(
  propertyId: string
): Promise<{ source: CatalogueSource; rooms: number }> {
  const { withTenant } = await import("@/lib/tenant-db");
  const count = await withTenant(propertyId, (tx) => tx.roomMapping.count({ where: { propertyId } }));
  if (count > 0) return { source: "settings", rooms: count };
  return { source: "none", rooms: 0 };
}
