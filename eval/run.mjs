// Eval runner: drives the case set against the live app and reports
// per-category rates, unblended. The referee for every prompt / model /
// catalogue change — re-run before deploy, record with date + commit.
//
//   EVAL_PASSWORD='...' pnpm eval                 # full set, saves results
//   EVAL_PASSWORD='...' pnpm eval -- --case=draft-flow
//   pnpm eval -- --list                           # no network, just the set
//
// Safety: logs in as the fixture property's OWNER (env password only,
// never committed), mints a direct token from /, and REFUSES unless the
// token's propertyId is the fixture property. Eval drafts are in-memory
// FIX- codes — no real Suite writes are possible on this path.
//
// Cost: ~18 cases, ~27 turns, ~40-55 model calls per full run.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CASES, CATEGORIES, EVAL_PROPERTY_ID } from "./cases.mjs";
import { PROMPT_VERSION } from "../lib/prompts.ts";

// Local-first env (same as funnel/dashboard): .env.local, then .env.
// dotenv never overrides real environment vars, so inline values still
// win — `EVAL_PASSWORD='...' pnpm eval` keeps working.
try {
  const dotenv = await import("dotenv").catch(() => null);
  dotenv?.config?.({ path: ".env.local" });
  dotenv?.config?.();
} catch {
  /* env-only is fine */
}

// Import-guarded (same pattern as prisma/seed-tenants.mjs): importing this
// file runs nothing — the /tmp harness test imports the helpers below.

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "1"] : ["_", a];
  })
);
const BASE_URL = (args["base-url"] ?? process.env.EVAL_BASE_URL ?? "https://app.vivereply.com").replace(/\/$/, "");
const EVAL_EMAIL = process.env.EVAL_EMAIL ?? "sabreeze@test.com";
const EVAL_PASSWORD = process.env.EVAL_PASSWORD ?? "";

function commitHash() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// --- auth: owner login -> session cookie -> direct token from / ----------

async function loginCookie() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EVAL_EMAIL, password: EVAL_PASSWORD }),
  });
  if (res.status === 429) throw new Error("Login throttled (429). Wait out the window and re-run.");
  if (!res.ok) throw new Error(`Login failed (${res.status}). Check EVAL_EMAIL / EVAL_PASSWORD.`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const session = setCookie.split(/,(?=[^;]+=)/).find((c) => c.trim().startsWith("concierge_session="));
  if (!session) throw new Error("Login answered 200 but set no session cookie.");
  return session.split(";")[0];
}

// The homepage embeds the direct chat token (b64url.b64url) in its RSC
// payload. Decode every candidate; the token is the one whose payload
// carries scope:"direct". Then the property guard below decides.
export function extractDirectToken(html) {
  const candidates = html.match(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/g) ?? [];
  for (const cand of candidates) {
    try {
      const payload = JSON.parse(Buffer.from(cand.split(".")[0], "base64url").toString("utf8"));
      if (payload && payload.scope === "direct" && typeof payload.propertyId === "string") {
        return { token: cand, propertyId: payload.propertyId };
      }
    } catch {
      // not a token-shaped string — keep scanning
    }
  }
  return null;
}

async function directToken(cookie) {
  const res = await fetch(`${BASE_URL}/`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`GET / failed (${res.status}).`);
  const found = extractDirectToken(await res.text());
  if (!found) throw new Error("No direct chat token found on /. Login may not have stuck.");
  if (found.propertyId !== EVAL_PROPERTY_ID) {
    throw new Error(
      `REFUSING: token is for "${found.propertyId}", not the fixture property "${EVAL_PROPERTY_ID}". ` +
        `Eval runs against the fixture backend only.`
    );
  }
  return found.token;
}

// --- chat driver: POST /api/chat, parse the SSE stream -------------------

async function chatTurn(token, message, conversationId) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      token,
      ...(conversationId ? { conversationId } : {}),
    }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return parseSseDone(await res.text());
}

// Split out for the harness test: feed canned SSE, get the done event.
export function parseSseDone(text) {
  let done = null;
  for (const chunk of text.split("\n\n")) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (event.type === "done") done = event;
      if (event.type === "error") throw new Error(`chat turn error: ${event.error}`);
    }
  }
  if (!done) throw new Error("Stream closed without a done event.");
  return done; // { reply, conversationId, cards }
}

// --- check engine ----------------------------------------------------------

function fillPlaceholders(pattern, captures) {
  if (typeof pattern === "string" && pattern.startsWith("{") && pattern.endsWith("}")) {
    const value = captures[pattern.slice(1, -1)];
    if (value === undefined) throw new Error(`No capture named ${pattern}.`);
    return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  return pattern;
}

export function runCheck(check, reply, cards, captures) {
  if (check.on === "reply") {
    if (check.present) {
      const re = fillPlaceholders(check.present, captures);
      return re.test(reply) ? null : `reply lacks ${re}`;
    }
    if (check.absent) {
      const m = reply.match(check.absent);
      return m ? `reply leaks ${JSON.stringify(m[0].slice(0, 60))}` : null;
    }
  }
  if (check.on === "cards") {
    if (check.none) return cards.length === 0 ? null : `expected no cards, got ${cards.length}`;
    const ofKind = cards.filter((c) => c.kind === check.kind);
    if (check.countAtLeast !== undefined && ofKind.length < check.countAtLeast) {
      return `expected >=${check.countAtLeast} ${check.kind} card(s), got ${ofKind.length}`;
    }
    if (check.countAtMost !== undefined && ofKind.length > check.countAtMost) {
      return `expected <=${check.countAtMost} ${check.kind} card(s), got ${ofKind.length}`;
    }
    if (check.countAtLeast === undefined && check.countAtMost === undefined && ofKind.length === 0) {
      return `no ${check.kind} card`;
    }
    const card = ofKind[0];
    // Quote cards carry one total; draft cards carry both legs, and the
    // check pins BOTH to the expected value (a draft whose legs differ
    // from each other fails here even when totalsMatch is asserted too).
    if (card && check.total !== undefined) {
      const totals = card.total !== undefined ? [card.total] : [card.suiteTotal, card.quotedTotal];
      if (!totals.every((t) => t === check.total)) {
        return `card total ${JSON.stringify(totals)}, expected ${JSON.stringify(check.total)}`;
      }
    }
    if (card && check.nights !== undefined && card.nights !== check.nights) {
      return `card nights ${card.nights}, expected ${check.nights}`;
    }
    if (card && check.totalsMatch !== undefined && card.totalsMatch !== check.totalsMatch) {
      return `card totalsMatch ${card.totalsMatch}, expected ${check.totalsMatch}`;
    }
    return null;
  }
  return `unknown check shape ${JSON.stringify(check)}`;
}

async function runCase(token, testCase) {
  const captures = {};
  let conversationId = null;
  let reply = "";
  let cards = [];
  for (const turn of testCase.turns) {
    const send = turn.send.replace(/\{(\w+)\}/g, (_, name) => {
      if (captures[name] === undefined) throw new Error(`No capture named {${name}}.`);
      return captures[name];
    });
    const done = await chatTurn(token, send, conversationId);
    conversationId = done.conversationId;
    reply = done.reply;
    cards = done.cards ?? [];
    for (const cap of turn.capture ?? []) {
      const card = cards.find((c) => c.kind === cap.card);
      if (!card || card[cap.field] === undefined) {
        throw new Error(`Capture failed: no ${cap.card} card with ${cap.field}.`);
      }
      captures[cap.as] = String(card[cap.field]);
    }
  }
  // Checks run against the FINAL turn's reply+cards only — earlier turns
  // are setup, and asserting on them would pin the model's small talk.
  const failures = [];
  const softWarnings = [];
  for (const check of testCase.checks) {
    const err = runCheck(check, reply, cards, captures);
    if (err) (check.soft ? softWarnings : failures).push(err);
  }
  return { failures, softWarnings, reply, cards };
}

// --- main ------------------------------------------------------------------

async function main() {
  if (args.list) {
    for (const c of CASES) console.log(`${c.id}  [${c.category}]  ${c.turns.length} turn(s), ${c.checks.length} check(s)`);
    console.log(`\n${CASES.length} cases, ${CATEGORIES.length} categories: ${CATEGORIES.join(", ")}`);
    return;
  }
  const onlyCase = args.case ?? null;
  if (onlyCase && !CASES.some((c) => c.id === onlyCase)) {
    console.error(`Unknown case "${onlyCase}". Use --list to see the set.`);
    process.exit(2);
  }
  if (!EVAL_PASSWORD) {
    console.error("Refusing: set EVAL_PASSWORD in the environment (the fixture owner's login password).");
    console.error("  EVAL_PASSWORD='<sabreeze current password — see docs/seed-users.md>' pnpm eval");
    process.exit(2);
  }

  const selected = onlyCase ? CASES.filter((c) => c.id === onlyCase) : CASES;
  const startedAt = new Date().toISOString();
  const hash = commitHash();

  console.log(`eval: ${BASE_URL} @ ${hash} — ${selected.length} case(s), property ${EVAL_PROPERTY_ID}, prompt v${PROMPT_VERSION}`);
  const cookie = await loginCookie();
  const token = await directToken(cookie);
  console.log(`eval: logged in as ${EVAL_EMAIL}, fixture token minted`);

  const results = [];
  for (const testCase of selected) {
    try {
      const { failures, softWarnings, reply, cards } = await runCase(token, testCase);
      const pass = failures.length === 0;
      results.push({ id: testCase.id, category: testCase.category, pass, failures, softWarnings });
      console.log(
        `${pass ? "PASS" : "FAIL"} ${testCase.id}${softWarnings.length ? `  (soft: ${softWarnings.join("; ")})` : ""}`
      );
      if (!pass) {
        for (const f of failures) console.log(`      - ${f}`);
        console.log(`      reply: ${JSON.stringify(reply.slice(0, 300))}`);
        console.log(`      cards: ${JSON.stringify(cards).slice(0, 300)}`);
      }
    } catch (e) {
      results.push({
        id: testCase.id,
        category: testCase.category,
        pass: false,
        failures: [`harness: ${e instanceof Error ? e.message : e}`],
        softWarnings: [],
      });
      console.log(`FAIL ${testCase.id}\n      - harness: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Per-category rates, never blended into one number.
  console.log("\ncategory rates:");
  const cats = [...new Set(results.map((r) => r.category))];
  for (const cat of cats) {
    const inCat = results.filter((r) => r.category === cat);
    const passed = inCat.filter((r) => r.pass).length;
    console.log(`  ${cat}: ${passed}/${inCat.length}`);
  }
  const totalPass = results.filter((r) => r.pass).length;
  const totalSoft = results.reduce((n, r) => n + r.softWarnings.length, 0);
  console.log(`cases: ${totalPass}/${results.length} hard-pass, ${totalSoft} soft warning(s)`);

  mkdirSync("eval/results", { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-").slice(0, 19);
  const outPath = `eval/results/${stamp}-${hash}.json`;
  writeFileSync(
    outPath,
    JSON.stringify({ startedAt, baseUrl: BASE_URL, commit: hash, property: EVAL_PROPERTY_ID, promptVersion: PROMPT_VERSION, results }, null, 2)
  );
  console.log(`results: ${outPath}`);

  process.exit(totalPass === results.length ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`eval: FAILED: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
