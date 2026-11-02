// Room-mapping health (CA-7). Pure aggregation: the caller injects a probe
// so this stays unit-testable without a backend. The admin health route
// wires the real probe (Suite availability per mapped room id).

export type MappingProbe = (suiteRoomId: string) => Promise<{ ok: boolean; reason?: string }>;

export type MappingHealth = {
  slug: string;
  suiteRoomId: string;
  ok: boolean;
  reason?: string;
};

export async function checkRoomMappings(
  rows: { slug: string; suiteRoomId: string }[],
  probe: MappingProbe
): Promise<MappingHealth[]> {
  const results: MappingHealth[] = [];
  for (const row of rows) {
    try {
      const r = await probe(row.suiteRoomId);
      results.push({ slug: row.slug, suiteRoomId: row.suiteRoomId, ok: r.ok, ...(r.reason ? { reason: r.reason } : {}) });
    } catch (e) {
      results.push({
        slug: row.slug,
        suiteRoomId: row.suiteRoomId,
        ok: false,
        reason: e instanceof Error ? e.message : "probe failed",
      });
    }
  }
  return results;
}
