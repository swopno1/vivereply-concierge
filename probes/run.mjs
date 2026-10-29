// Tenant-isolation probe suite: the 10 cross-tenant tests from
// notes_checklists/security-tenant-isolation-checklist-2026-10-29.md,
// runnable against the live app. Untested isolation is the gap this
// closes — every boundary below is a recorded pass/fail with date +
// commit, not a code-read claim.
//
//   PROBE_A_PASSWORD='...' PROBE_B_PASSWORD='...' \
//     PROBE_ADMIN_EMAIL='...' PROBE_ADMIN_PASSWORD='...' \
//     PROBE_A_OWNER_ID='...' pnpm probes
//   pnpm probes -- --probe=cross-conversation   # one probe
//   pnpm probes -- --list                       # no network, just the set
//
// Tenant A = the mutating test tenant (default seabreeze-test): probes
// suspend it, deactivate its owner, and toggle its domains. Tenant B =
// the read-only reference (default krishnachura-retreat): never mutated,
// only chatted with (read-only turns, no drafts). The runner REFUSES to
// run mutating probes when A is the demo property unless
// --allow-demo-mutation is passed.
//
// Safety: probes that lack their env print SKIP (not fail). Results save
// to probes/results/<date>-<commit>.json. Notes never contain tokens,
// cookies, passwords, or guest content — statuses and booleans only.
//
// Cost: ~10 model calls per full run (mostly fixture greetings; two
// turns touch the live demo property, reads only, no drafts).

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractDirectToken, parseSseDone } from "../eval/run.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "1"] : ["_", a];
  })
);
const BASE_URL = (args["base-url"] ?? process.env.PROBE_BASE_URL ?? "https://app.vivereply.com").replace(/\/$/, "");

const A = {
  property: process.env.PROBE_A_PROPERTY ?? "seabreeze-test",
  email: process.env.PROBE_A_EMAIL ?? "sabreeze@test.com",
  password: process.env.PROBE_A_PASSWORD ?? "",
  key: process.env.PROBE_A_KEY ?? "test-seabreeze",
  ownerId: process.env.PROBE_A_OWNER_ID ?? "",
};
const B = {
  property: process.env.PROBE_B_PROPERTY ?? "krishnachura-retreat",
  email: process.env.PROBE_B_EMAIL ?? "krishnachura@test.com",
  password: process.env.PROBE_B_PASSWORD ?? "",
  key: process.env.PROBE_B_KEY ?? "demo-krishnachura",
  domain: process.env.PROBE_B_DOMAIN ?? "demo1.vivereply.com",
};
const ADMIN = {
  email: process.env.PROBE_ADMIN_EMAIL ?? "",
  password: process.env.PROBE_ADMIN_PASSWORD ?? "",
};

function commitHash() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function fail(msg) {
  throw new Error(msg);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
}

// --- drivers -----------------------------------------------------------

async function loginCookie(email, password, label) {
  if (!email || !password) fail(`${label}: credentials missing (env).`);
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 429) fail("Login throttled (429). Wait out the window and re-run.");
  if (!res.ok) fail(`${label}: login failed (${res.status}).`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const session = setCookie.split(/,(?=[^;]+=)/).find((c) => c.trim().startsWith("concierge_session="));
  if (!session) fail(`${label}: login answered 200 but set no session cookie.`);
  return session.split(";")[0];
}

async function directTokenFor(cookie, expectProperty, label) {
  const res = await fetch(`${BASE_URL}/`, { headers: { Cookie: cookie } });
  if (!res.ok) fail(`${label}: GET / failed (${res.status}).`);
  const found = extractDirectToken(await res.text());
  if (!found) fail(`${label}: no direct chat token found on /.`);
  if (found.propertyId !== expectProperty) {
    fail(`${label}: token is for "${found.propertyId}", expected "${expectProperty}".`);
  }
  return found.token;
}

function decodeTokenProperty(token) {
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
  return payload.propertyId;
}

async function chatRaw(token, message, extra = {}) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, token, ...extra }),
  });
  if (!res.ok) return { status: res.status, done: null };
  return { status: 200, done: parseSseDone(await res.text()) };
}

async function api(path, { method = "GET", cookie = "", body = null, headers = {} } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function handshake(key, origin) {
  const res = await fetch(`${BASE_URL}/api/widget-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ key }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, token: json?.token ?? null };
}

const noQuoteCard = (done) => !(done?.cards ?? []).some((c) => c.kind === "quote");

// --- probes ------------------------------------------------------------

const PROBES = [
  {
    id: "cross-conversation",
    title: "A's token + B's conversationId is ignored (fresh thread, no read/append)",
    needs: ["A creds", "B creds"],
    async run(notes) {
      if (!B.password) return "skip: PROBE_B_PASSWORD unset";
      const cookieB = await loginCookie(B.email, B.password, "B login");
      const tokB = await directTokenFor(cookieB, B.property, "B token");
      const rb = await chatRaw(tokB, "Hello", {});
      assert(rb.status === 200 && rb.done?.conversationId, "B baseline turn failed");
      const convB = rb.done.conversationId;
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const tokA = await directTokenFor(cookieA, A.property, "A token");
      const ra = await chatRaw(tokA, "What did I just ask about?", { conversationId: convB });
      assert(ra.status === 200, `A turn failed (${ra.status})`);
      assert(
        ra.done?.conversationId && ra.done.conversationId !== convB,
        "A's turn reused B's conversation — cross-tenant thread reuse!"
      );
      notes.push("B conversation ignored; A got a fresh thread");
      return "pass";
    },
  },
  {
    id: "forged-property",
    title: "Forged propertyId in chat body is ignored (token governs)",
    needs: ["A creds"],
    async run(notes) {
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const tokA = await directTokenFor(cookieA, A.property, "A token");
      // Terracotta Villa exists ONLY in B's catalogue: if the forged
      // propertyId took effect, this would quote. It must not.
      const r = await chatRaw(tokA, "How much is the Terracotta Villa for Nov 10–12?", {
        propertyId: B.property,
      });
      assert(r.status === 200, `turn failed (${r.status})`);
      assert(noQuoteCard(r.done), "quoted a B-only room on a forged propertyId — token did not govern!");
      notes.push("forged field ignored; no B quote produced");
      return "pass";
    },
  },
  {
    id: "owner-cross-read",
    title: "A's owner session cannot read B's config, and lists stay scoped",
    needs: ["A creds"],
    async run(notes) {
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const rooms = await api(`/api/admin/room-mappings?propertyId=${encodeURIComponent(B.property)}`, {
        cookie: cookieA,
      });
      assert(rooms.status === 403, `room-mappings cross-read: expected 403, got ${rooms.status}`);
      const onb = await api(`/api/admin/onboarding?propertyId=${encodeURIComponent(B.property)}`, {
        cookie: cookieA,
      });
      assert(onb.status === 403, `onboarding cross-read: expected 403, got ${onb.status}`);
      const users = await api("/api/admin/users", {
        method: "PATCH",
        cookie: cookieA,
        body: { id: "no-such-user", active: false },
      });
      assert(users.status === 403, `users PATCH as owner: expected 403, got ${users.status}`);
      for (const path of ["/api/admin/domains", "/api/admin/suite-bindings", "/api/admin/bridge-tokens"]) {
        const r = await api(path, { cookie: cookieA });
        assert(r.status === 200, `${path}: expected 200, got ${r.status}`);
        assert(Array.isArray(r.json), `${path}: expected a list`);
        assert(
          r.json.every((row) => row.propertyId === A.property),
          `${path}: list contains another tenant's rows!`
        );
        notes.push(`${path}: ${r.json.length} row(s), all ${A.property}`);
      }
      const staff = await fetch(`${BASE_URL}/staff?property=${encodeURIComponent(B.property)}`, {
        headers: { Cookie: cookieA },
      });
      const html = await staff.text();
      assert(staff.status === 200, `/staff: expected 200, got ${staff.status}`);
      assert(html.includes(A.property), "/staff did not render A's queue");
      notes.push("override ?property=B ignored on /staff");
      return "pass";
    },
  },
  {
    id: "rag-silence",
    title: "RAG canary: B-only facts never surface in A's answers",
    needs: ["A creds", "B creds", "B seeded docs"],
    async run(notes) {
      if (!B.password) return "skip: PROBE_B_PASSWORD unset";
      // Asymmetric corpora by design: B (krishnachura) has the 5 seeded
      // docs; A (seabreeze) has none. "Family Gathering Week / ৳98,000"
      // exists ONLY in B's corpus — the canary. (If A ever gains docs,
      // this probe needs dedicated canary seeding; see README.)
      const Q = "Do you have a family package? What does it cost?";
      const cookieB = await loginCookie(B.email, B.password, "B login");
      const tokB = await directTokenFor(cookieB, B.property, "B token");
      const rb = await chatRaw(tokB, Q, {});
      assert(rb.status === 200, `B turn failed (${rb.status})`);
      assert(
        /family gathering week/i.test(rb.done?.reply ?? ""),
        "B did not ground from its own docs — probe is indiscriminate, investigate before trusting A"
      );
      notes.push("B grounded (discriminating power confirmed)");
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const tokA = await directTokenFor(cookieA, A.property, "A token");
      const ra = await chatRaw(tokA, Q, {});
      assert(ra.status === 200, `A turn failed (${ra.status})`);
      const reply = ra.done?.reply ?? "";
      assert(
        !/family gathering week|98,?000/i.test(reply),
        "LEAK: B-only RAG fact surfaced in A's answer!"
      );
      assert(
        /don't know|do not know|not sure|can.{0,12}help|staff|handoff/i.test(reply) ||
          (ra.done?.cards ?? []).some((c) => c.kind === "handoff"),
        "A neither stayed silent nor offered handoff on an ungrounded question"
      );
      notes.push("A silent on canary + don't-know/handoff behavior");
      return "pass";
    },
  },
  {
    id: "domain-toggle",
    title: "Deactivating a domain denies the next message; reactivate restores",
    needs: ["A creds"],
    async run(notes) {
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const domain = `probe5-${Date.now().toString(36)}.invalid`;
      const origin = `https://${domain}`;
      const created = await api("/api/admin/domains", {
        method: "POST",
        cookie: cookieA,
        body: { domain, propertyId: A.property },
      });
      assert(created.status === 201 && created.json?.id, `domain add failed (${created.status})`);
      const id = created.json.id;
      try {
        const h1 = await handshake(A.key, origin);
        assert(h1.status === 200 && h1.token, `baseline handshake failed (${h1.status})`);
        assert(decodeTokenProperty(h1.token) === A.property, "handshake token is not A's property");
        const c1 = await chatRaw(h1.token, "Hello", {});
        assert(c1.status === 200, `baseline chat failed (${c1.status})`);
        const off = await api("/api/admin/domains", {
          method: "PATCH",
          cookie: cookieA,
          body: { id, active: false },
        });
        assert(off.status === 200, `deactivate failed (${off.status})`);
        const c2 = await chatRaw(h1.token, "Hello again", {});
        assert(c2.status === 403, `expected 403 after deactivation, got ${c2.status}`);
        const h2 = await handshake(A.key, origin);
        assert(h2.status === 403, `expected handshake 403 after deactivation, got ${h2.status}`);
        const on = await api("/api/admin/domains", {
          method: "PATCH",
          cookie: cookieA,
          body: { id, active: true },
        });
        assert(on.status === 200, `reactivate failed (${on.status})`);
        const c3 = await chatRaw(h1.token, "Hello once more", {});
        assert(c3.status === 200, `recovery chat failed (${c3.status})`);
        notes.push("deny-on-next-message + handshake gate + recovery verified");
      } finally {
        // Safe resting state: row stays inactive (unresolvable host, zero
        // traffic impact). Runbook SQL removes the row when tidying.
        await api("/api/admin/domains", { method: "PATCH", cookie: cookieA, body: { id, active: false } });
      }
      return "pass";
    },
  },
  {
    id: "suspend-killswitch",
    title: "INACTIVE property: issuance, chat, login, session all refuse; resume restores",
    needs: ["A creds", "admin creds", "MUTATES A status (guarded)"],
    async run(notes) {
      if (!ADMIN.email || !ADMIN.password) return "skip: PROBE_ADMIN_* unset";
      const admin = await loginCookie(ADMIN.email, ADMIN.password, "admin login");
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const domain = `probe6-${Date.now().toString(36)}.invalid`;
      const origin = `https://${domain}`;
      const created = await api("/api/admin/domains", {
        method: "POST",
        cookie: cookieA,
        body: { domain, propertyId: A.property },
      });
      assert(created.status === 201 && created.json?.id, `scratch domain add failed (${created.status})`);
      const domainId = created.json.id;
      const setStatus = async (status) => {
        const r = await api("/api/admin/properties", {
          method: "PATCH",
          cookie: admin,
          body: { id: A.property, status },
        });
        assert(r.status === 200, `set status ${status} failed (${r.status})`);
      };
      try {
        const h0 = await handshake(A.key, origin);
        assert(h0.status === 200 && h0.token, `baseline handshake failed (${h0.status})`);
        const tokA = await directTokenFor(cookieA, A.property, "A token");
        const c0 = await chatRaw(tokA, "Hello", {});
        assert(c0.status === 200, `baseline chat failed (${c0.status})`);
        await setStatus("INACTIVE");
        notes.push("suspended");
        const h1 = await handshake(A.key, origin);
        assert(h1.status === 403, `issuance while suspended: expected 403, got ${h1.status}`);
        const c1 = await chatRaw(h0.token, "Hello", {});
        assert(c1.status === 403, `widget chat while suspended: expected 403, got ${c1.status}`);
        const c2 = await chatRaw(tokA, "Hello", {});
        assert(c2.status === 403, `direct chat while suspended: expected 403, got ${c2.status}`);
        const relog = await api("/api/auth/login", {
          method: "POST",
          body: { email: A.email, password: A.password },
        });
        assert(relog.status === 401, `owner login while suspended: expected 401, got ${relog.status}`);
        const stale = await api("/api/admin/domains", { cookie: cookieA });
        assert(stale.status === 401, `stale owner session while suspended: expected 401, got ${stale.status}`);
        notes.push("issuance + both chat scopes + login + live session all refused");
      } finally {
        await setStatus("ACTIVE").catch(() => fail("CRITICAL: could not reactivate A — reactivate by hand NOW"));
      }
      const h2 = await handshake(A.key, origin);
      assert(h2.status === 200, `recovery handshake failed (${h2.status})`);
      const cookieA2 = await loginCookie(A.email, A.password, "A re-login");
      const tokA2 = await directTokenFor(cookieA2, A.property, "A token 2");
      const c3 = await chatRaw(tokA2, "Hello", {});
      assert(c3.status === 200, `recovery chat failed (${c3.status})`);
      await api("/api/admin/domains", { method: "PATCH", cookie: cookieA2, body: { id: domainId, active: false } });
      notes.push("resume restores every surface");
      return "pass";
    },
  },
  {
    id: "owner-deactivate",
    title: "Deactivating A's owner kills the live session and blocks login; reactivate restores",
    needs: ["A creds", "admin creds", "A owner id"],
    async run(notes) {
      if (!ADMIN.email || !ADMIN.password) return "skip: PROBE_ADMIN_* unset";
      if (!A.ownerId) return "skip: PROBE_A_OWNER_ID unset";
      const admin = await loginCookie(ADMIN.email, ADMIN.password, "admin login");
      const setActive = async (active) => {
        const r = await api("/api/admin/users", {
          method: "PATCH",
          cookie: admin,
          body: { id: A.ownerId, active },
        });
        assert(r.status === 200, `set owner active=${active} failed (${r.status})`);
      };
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const base = await api("/api/admin/domains", { cookie: cookieA });
      assert(base.status === 200, `baseline authed call failed (${base.status})`);
      try {
        await setActive(false);
        const dead = await api("/api/admin/domains", { cookie: cookieA });
        assert(dead.status === 401, `live session after deactivate: expected 401, got ${dead.status}`);
        const relog = await api("/api/auth/login", {
          method: "POST",
          body: { email: A.email, password: A.password },
        });
        assert(relog.status === 401, `login while deactivated: expected 401, got ${relog.status}`);
        notes.push("session killed + login blocked");
      } finally {
        await setActive(true).catch(() => fail("CRITICAL: could not reactivate A owner — reactivate by hand NOW"));
      }
      await loginCookie(A.email, A.password, "A re-login");
      notes.push("recovery login works");
      return "pass";
    },
  },
  {
    id: "cross-catalogue",
    title: "A's chat cannot quote B-only rooms (schema + executor both refuse)",
    needs: ["A creds"],
    async run(notes) {
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const tokA = await directTokenFor(cookieA, A.property, "A token");
      const r = await chatRaw(tokA, "How much is the Terracotta Villa for Nov 10–12?", {});
      assert(r.status === 200, `turn failed (${r.status})`);
      assert(noQuoteCard(r.done), "quoted a room outside A's catalogue!");
      notes.push("B-only room unquotable from A");
      return "pass";
    },
  },
  {
    id: "shared-domain",
    title: "Same domain approved for two properties does not merge traffic",
    needs: ["A creds"],
    async run(notes) {
      const cookieA = await loginCookie(A.email, A.password, "A login");
      const origin = `https://${B.domain}`;
      // B's domain under A's property: allowed by design (unique pair is
      // domain+property). Resolution is per key, so traffic must not merge.
      const added = await api("/api/admin/domains", {
        method: "POST",
        cookie: cookieA,
        body: { domain: B.domain, propertyId: A.property },
      });
      assert(
        added.status === 201 && added.json?.id,
        `cross-property domain add failed (${added.status}) — if 409, the API now rejects; update this probe`
      );
      const id = added.json.id;
      try {
        const ha = await handshake(A.key, origin);
        assert(ha.status === 200 && ha.token, `A handshake failed (${ha.status})`);
        assert(decodeTokenProperty(ha.token) === A.property, "A's key resolved to the wrong property!");
        const hb = await handshake(B.key, origin);
        assert(hb.status === 200 && hb.token, `B handshake failed (${hb.status})`);
        assert(decodeTokenProperty(hb.token) === B.property, "B's key resolved to the wrong property!");
        notes.push("per-key resolution holds; no merge");
      } finally {
        await api("/api/admin/domains", { method: "PATCH", cookie: cookieA, body: { id, active: false } });
      }
      return "pass";
    },
  },
  {
    id: "bootstrap-closed",
    title: "Bootstrap login fails closed on a wrong password (generic message)",
    needs: ["admin email only"],
    async run(notes) {
      if (!ADMIN.email) return "skip: PROBE_ADMIN_EMAIL unset";
      const r = await api("/api/auth/login", {
        method: "POST",
        body: { email: ADMIN.email, password: "definitely-not-the-password-000" },
      });
      assert(r.status === 401, `wrong-password bootstrap login: expected 401, got ${r.status}`);
      assert(
        r.json?.error === "Invalid email or password.",
        "bootstrap failure message is not the generic one (enumeration risk?)"
      );
      notes.push("wrong password refused, generic message; env-unset half is code-verified (auth.ts)");
      return "pass";
    },
  },
];

// --- main --------------------------------------------------------------

function usage() {
  console.log("Tenant-isolation probes. Env: PROBE_A_PASSWORD, PROBE_B_PASSWORD,");
  console.log("PROBE_ADMIN_EMAIL, PROBE_ADMIN_PASSWORD, PROBE_A_OWNER_ID,");
  console.log("optional PROBE_{BASE_URL,A_PROPERTY,A_EMAIL,A_KEY,B_PROPERTY,B_EMAIL,B_KEY,B_DOMAIN}.");
  console.log("  pnpm probes -- --list | --probe=<id> | --base-url=<url>");
}

async function main() {
  if (args.help) {
    usage();
    return;
  }
  if (args.list) {
    for (const p of PROBES) console.log(`${p.id}  [${p.needs.join("; ")}]\n  ${p.title}`);
    console.log(`\n${PROBES.length} probes. Live run needs the env above; --list needs nothing.`);
    return;
  }
  if (A.property === B.property) fail("A and B properties must differ.");
  const DEMO_FALLBACK = "krishnachura-retreat";
  const mutating = ["suspend-killswitch", "owner-deactivate"];
  const selected = args.probe ? PROBES.filter((p) => p.id === args.probe) : PROBES;
  if (args.probe && selected.length === 0) fail(`Unknown probe "${args.probe}". See --list.`);
  if (
    !args["allow-demo-mutation"] &&
    A.property === DEMO_FALLBACK &&
    selected.some((p) => mutating.includes(p.id))
  ) {
    fail(
      `REFUSING: mutating probes target the demo property "${DEMO_FALLBACK}". ` +
        `Point PROBE_A_* at the test tenant, or pass --allow-demo-mutation.`
    );
  }
  if (!A.password) fail("PROBE_A_PASSWORD is required for any live run.");
  const results = [];
  for (const probe of selected) {
    const notes = [];
    const started = Date.now();
    process.stdout.write(`${probe.id} ... `);
    try {
      const outcome = await probe.run(notes);
      const skipped = outcome !== "pass";
      if (skipped) notes.push(outcome);
      results.push({ id: probe.id, pass: !skipped, skipped, notes });
      console.log(skipped ? `SKIP (${outcome})` : "PASS");
    } catch (e) {
      results.push({ id: probe.id, pass: false, skipped: false, notes: [...notes, `FAIL: ${e.message}`] });
      console.log(`FAIL: ${e.message}`);
    }
    results[results.length - 1].ms = Date.now() - started;
  }
  const record = {
    date: new Date().toISOString(),
    commit: commitHash(),
    baseUrl: BASE_URL,
    aProperty: A.property,
    bProperty: B.property,
    results,
  };
  mkdirSync("probes/results", { recursive: true });
  const stamp = record.date.slice(0, 10);
  const path = `probes/results/${stamp}-${record.commit}.json`;
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  const failed = results.filter((r) => !r.pass && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log(`\n${results.length - failed - skipped}/${results.length} passed, ${skipped} skipped, ${failed} failed. Saved ${path}`);
  if (failed > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

