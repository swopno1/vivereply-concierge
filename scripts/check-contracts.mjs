// Nightly Suite contract checks (read-only): ping, availability shape,
// unknown-room 404, invalid-date 400, unknown-code lookup 404. Catches
// silent demo1 drift without touching data.
//
// Deliberately NOT checked here: POST /api/bookings (creates real
// holds) and POST /api/bookings/send-details (sends real email).
// Those stay manual, run rarely, against a documented test guest.
//
//   SUITE_API_BASE_URL=... SUITE_CONTRACT_ROOM_ID=... [SUITE_API_KEY=...] node scripts/check-contracts.mjs
//
// Exit 0 = all contracts hold; non-zero names the first breach.

const BASE = (process.env.SUITE_API_BASE_URL ?? "").replace(/\/$/, "");
const ROOM_ID = process.env.SUITE_CONTRACT_ROOM_ID ?? "";
const KEY = process.env.SUITE_API_KEY ?? "";

function fail(msg) {
  console.error(`contract BREACH: ${msg}`);
  process.exitCode = 1;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: KEY ? { Authorization: `Bearer ${KEY}` } : {},
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  if (!BASE || !ROOM_ID) {
    console.error("Refusing: set SUITE_API_BASE_URL and SUITE_CONTRACT_ROOM_ID.");
    process.exit(2);
  }
  let n = 0;
  const ok = (name) => {
    n += 1;
    console.log(`contract ok: ${name}`);
  };

  // 1. Ping shape.
  {
    const { status, body } = await get("/api/concierge/ping");
    if (status !== 200 || body?.ok !== true || typeof body?.suiteVersion !== "number") {
      fail(`ping: status ${status}, body ${JSON.stringify(body)}`);
    } else ok("ping { ok, suiteVersion }");
  }

  // 2. Availability shape (fixed future stay).
  {
    const { status, body } = await get(
      `/api/rooms/${encodeURIComponent(ROOM_ID)}/availability?checkIn=2026-12-01&checkOut=2026-12-03`
    );
    if (status !== 200 || typeof body?.available !== "number") {
      fail(`availability: status ${status}, body ${JSON.stringify(body)?.slice(0, 200)}`);
    } else ok(`availability { available:${body.available} }`);
  }

  // 3. Unknown room -> 404 with error shape.
  {
    const { status, body } = await get("/api/rooms/no-such-room-xyz/availability?checkIn=2026-12-01&checkOut=2026-12-03");
    if (status !== 404 || typeof body?.error !== "string") {
      fail(`unknown room: status ${status}, body ${JSON.stringify(body)?.slice(0, 200)}`);
    } else ok("unknown room -> 404 { error }");
  }

  // 4. Invalid dates -> 400 with error shape.
  {
    const { status, body } = await get(
      `/api/rooms/${encodeURIComponent(ROOM_ID)}/availability?checkIn=soon&checkOut=later`
    );
    if (status !== 400 || typeof body?.error !== "string") {
      fail(`invalid dates: status ${status}, body ${JSON.stringify(body)?.slice(0, 200)}`);
    } else ok("invalid dates -> 400 { error }");
  }

  // 5. Unknown booking code -> 404 (minimal disclosure preserved).
  {
    const { status, body } = await get("/api/bookings/lookup?code=RES-00000-NIGHTLY");
    if (status !== 404) {
      fail(`unknown code: status ${status}, body ${JSON.stringify(body)?.slice(0, 200)}`);
    } else ok("unknown code -> 404");
  }

  if (!process.exitCode) console.log(`contracts: ${n}/5 hold.`);
}

main().catch((e) => {
  console.error(`contracts: FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(2);
});
