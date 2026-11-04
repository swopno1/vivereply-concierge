# Seed users (fixture tenant)

Source of truth for the seed values is `prisma/seed-tenants.mjs`
(`ownerPassword` per entry) — this doc explains them. Seeds run via
`pnpm seed:tenants` from a machine that reaches the database.

Since the signup era (2026-11-04) the seed holds ONLY the fixture
tenant. Real properties — including the live demo resort — come from
public `/signup` with owner-chosen IDs and are never seeded (seeding a
second "demo" property would duplicate live domain approvals).

## The logins

| Property | Owner email | Initial password | Widget key | Domains |
|---|---|---|---|---|
| seabreeze-test (fixture) | sabreeze@test.com | `seabreeze-demo-login-01` | test-seabreeze | (none — direct token until approved) |

The live demo property (signup-created, e.g. `krishnachura-resort-*`)
is NOT in this table — its owner, key, and password live in the product
and the founder's vault, never in git.

No super-admin User row is seeded — the founder logs in via the
`ADMIN_EMAIL` + `ADMIN_PASSWORD` bootstrap (env).

## Security contract (read this)

- The fixture password is COMMITTED to git. Treat it as public to
  every repo reader — that is the price of inline seed data, paid
  deliberately for evidence-run convenience.
- Fixture ONLY. Real tenants MUST come from public `/signup`
  (email verification + Turnstile, no temp passwords). Never seed a
  real resort's login here.
- After seeding production: the eval/probes need sabreeze's CURRENT
  password in env (`EVAL_PASSWORD`, `PROBE_A_PASSWORD`). If the owner
  rotates in Settings, update the env, not the seed.
- Re-running the seed NEVER resets an existing user's password
  (by design — the committed value must not silently restore over
  a rotation). Rotation happens in Settings.
- Seabreeze rooms mirror `demo-config/fixture.ts` exactly (slugs,
  poisha, suite ids) — the PRICE CONTRACT in the seed file. A drift
  surfaces as a totals warning on drafts.

## Automation linkage

- Eval referee: `EVAL_PASSWORD` = sabreeze's CURRENT password;
  `EVAL_PROPERTY_ID` defaults to `seabreeze-test` (override only for
  another fixture-backend tenant — never a live property, whose
  drafts would be REAL bookings).
- Probes: A = seabreeze fixture (`PROBE_A_PASSWORD` = sabreeze's
  current password, `PROBE_A_OWNER_ID` from
  `SELECT id FROM "User" WHERE email='sabreeze@test.com';`).
  B = the LIVE property via `PROBE_B_PROPERTY/EMAIL/PASSWORD/KEY`
  (read-only turns only — B is never mutated). `PROBE_ADMIN_*` =
  the bootstrap admin (env).
- `rag-silence` needs a canary from B's LIVE corpus:
  `PROBE_B_CANARY_Q` (question), `PROBE_B_CANARY_A` (answer regex),
  optional `PROBE_B_CANARY_LEAK` (leak regex, defaults to A).
  Pick Q/A from B's `KnowledgeDocument` titles. Unset = honest SKIP.
- After ANY database reset: `pnpm seed:tenants` first, or eval
  refuses (fixture property missing) and probes fail closed.
