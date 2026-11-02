import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { checkRoomMappings } from "@/lib/room-mapping-health";

const ROWS = [
  { slug: "ok-room", suiteRoomId: "uuid-1" },
  { slug: "gone-room", suiteRoomId: "uuid-2" },
  { slug: "flaky-room", suiteRoomId: "uuid-3" },
];

describe("checkRoomMappings (CA-7)", () => {
  it("reports per-row ok/broken without throwing on probe failures", async () => {
    const probe = async (id) => {
      if (id === "uuid-1") return { ok: true };
      if (id === "uuid-2") return { ok: false, reason: "room not found on backend (404)" };
      throw new Error("network down");
    };
    const results = await checkRoomMappings(ROWS, probe);
    assert.deepEqual(results, [
      { slug: "ok-room", suiteRoomId: "uuid-1", ok: true },
      { slug: "gone-room", suiteRoomId: "uuid-2", ok: false, reason: "room not found on backend (404)" },
      { slug: "flaky-room", suiteRoomId: "uuid-3", ok: false, reason: "network down" },
    ]);
  });

  it("returns an empty list for no rows", async () => {
    assert.deepEqual(await checkRoomMappings([], async () => ({ ok: true })), []);
  });
});
