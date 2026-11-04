# Tenant-isolation probes

The 10 cross-tenant tests from
`notes_checklists/security-tenant-isolation-checklist-2026-10-29.md`,
runnable against the live app. A green run with date + commit is the
evidence behind any "multi-tenant" claim — code reads alone don't count.

```bash
PROBE_A_PASSWORD='...' PROBE_B_PASSWORD='...' \
  PROBE_ADMIN_EMAIL='...' PROBE_ADMIN_PASSWORD='...' \
  PROBE_A_OWNER_ID='...' pnpm probes
```

## Tenants

- **A (mutating test tenant, default `seabreeze-test`):** probes suspend
  it, deactivate its owner, and toggle its domains. Reseed after any
  DB reset (`pnpm seed:tenants`). Override with
  `PROBE_A_PROPERTY`, `PROBE_A_EMAIL`, `PROBE_A_PASSWORD`
  (required), `PROBE_A_KEY`, `PROBE_A_OWNER_ID` (user id from SQL:
  `SELECT id FROM "User" WHERE email='sabreeze@test.com';`).
- **B (read-only reference — the LIVE signup-created property):** only
  chatted with — read-only turns, never drafted, never suspended.
  No live default exists (signup IDs are owner-chosen): set
  `PROBE_B_PROPERTY`, `PROBE_B_EMAIL`, `PROBE_B_PASSWORD`
  (required for the cross-tenant chat probes), `PROBE_B_KEY`,
  `PROBE_B_DOMAIN` (default `demo1.vivereply.com`).
- **Admin:** `PROBE_ADMIN_EMAIL` + `PROBE_ADMIN_PASSWORD` (bootstrap).

Target: `PROBE_BASE_URL` or `--base-url=` (default
`https://app.vivereply.com`).

## Safety rules (enforced by the runner)

- A and B must differ, or the run refuses to start.
- The mutating probes (`suspend-killswitch`, `owner-deactivate`) REFUSE
  to run when A is the demo property — unless `--allow-demo-mutation`
  is passed. A is the test tenant; B is never mutated by any probe.
- Every mutating probe restores state in a `finally` (reactivate,
  re-enable) and fails LOUD (`CRITICAL: ... by hand NOW`) if
  restoration itself fails. If a run dies mid-suspend, check A's status
  first: `SELECT id, status FROM "Property" WHERE id='seabreeze-test';`
- Probes missing their env print SKIP, never fail. A complete gate
  needs the full env above.

## What the probes leave behind

Scratch domains (`probe5-*.invalid`, `probe6-*.invalid`, B's domain
under A) are deactivated but not deleted — there is no domain-delete
endpoint by design. Tidy with the off-boarding runbook's cleanup SQL.
Probe-created conversations are the founder's own test threads.

## Known limits

- `rag-silence` exploits asymmetric corpora (B has onboarded RAG docs;
  A has none). The canary is corpus-specific: set `PROBE_B_CANARY_Q`
  (question from B's live docs), `PROBE_B_CANARY_A` (answer regex),
  optional `PROBE_B_CANARY_LEAK` (defaults to the answer pattern).
  Unset = honest SKIP, never a guessed fail. If A ever gains docs,
  this probe needs dedicated per-tenant canary seeding instead.
- `bootstrap-closed` covers the wrong-password half at runtime; the
  env-unset half (no `ADMIN_EMAIL` → impossible) is code-verified in
  `lib/auth.ts` and cannot be probed without env control.
- Cost: ~10 model calls per full run (fixture greetings plus two
  read-only demo turns). No Suite writes, no drafts.

`--list` prints the set without touching the network.
`--probe=<id>` runs one probe. Results save to
`probes/results/<date>-<commit>.json` — commit the green run; it is
submission evidence.
