// Fixture load probe: N concurrent first-turn chats against the live
// app, measuring guest-visible latency and error rate. COSTS REAL
// MODEL CALLS (~N turns) — run deliberately, not on a schedule, and
// only against the fixture property (refuses otherwise).
//
//   EVAL_EMAIL=... EVAL_PASSWORD=... node scripts/load.mjs --n=20 [--base-url=...]
//
// Reports p50/p95 latency + error count; exit non-zero on ANY error.
// Pre-pilot use: set p95/error/pool targets from the first run, then a
// 30-minute soak. There are no targets yet — this script produces the
// first measurement, not a pass/fail against one.

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "1"] : ["_", a];
  })
);
const N = Math.max(1, Math.min(100, Number.parseInt(args.n ?? "20", 10) || 20));
const BASE_URL = (args["base-url"] ?? process.env.PROBE_BASE_URL ?? "https://app.vivereply.com").replace(/\/$/, "");
const EMAIL = process.env.EVAL_EMAIL ?? process.env.PROBE_A_EMAIL ?? "";
const PASSWORD = process.env.EVAL_PASSWORD ?? process.env.PROBE_A_PASSWORD ?? "";

async function loginCookie() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const sid = setCookie.match(/concierge_session=([^;]+)/)?.[1];
  if (!sid) throw new Error("login returned no session cookie");
  return `concierge_session=${sid}`;
}

async function directToken(cookie) {
  // A direct visit mints the token; refuse unless it is the fixture property.
  const res = await fetch(`${BASE_URL}/`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`GET / failed (${res.status})`);
  const html = await res.text();
  const candidates = html.match(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/g) ?? [];
  for (const cand of candidates) {
    try {
      const payload = JSON.parse(Buffer.from(cand.split(".")[0], "base64url").toString("utf8"));
      if (payload?.scope === "direct" && typeof payload.propertyId === "string") {
        if (payload.propertyId !== "seabreeze-test") {
          throw new Error(`refusing: token property ${payload.propertyId} is not the fixture property`);
        }
        return cand;
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("refusing:")) throw e;
    }
  }
  throw new Error("no direct token on /");
}

async function oneTurn(token, i) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, message: `Load probe ${i}: how much is the Dune Room Dec 1-3, 2026?` }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    const done = text.split("\n").find((l) => l.startsWith("data: "));
    const reply = done ? JSON.parse(done.slice(6)).reply ?? "" : "";
    if (!res.ok || !reply) throw new Error(`status ${res.status}, empty reply`);
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Refusing: set EVAL_EMAIL + EVAL_PASSWORD (fixture owner).");
    process.exit(2);
  }
  console.log(`load: ${N} concurrent fixture turns vs ${BASE_URL} (costs ~${N} model turns)`);
  const cookie = await loginCookie();
  const token = await directToken(cookie);
  const results = await Promise.all(Array.from({ length: N }, (_, i) => oneTurn(token, i)));
  const lat = results.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
  const errs = results.filter((r) => !r.ok);
  const pct = (p) => (lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))]) : "-");
  console.log(`load: ok=${lat.length}/${N}, p50=${pct(50)}ms, p95=${pct(95)}ms, errors=${errs.length}`);
  for (const e of errs.slice(0, 5)) console.log(`  error: ${e.error} (${e.ms}ms)`);
  if (errs.length) process.exit(1);
}

main().catch((e) => {
  console.error(`load: FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(2);
});
