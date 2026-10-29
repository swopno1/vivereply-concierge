# Seed users (test tenants)

Source of truth for the seed values is `prisma/seed-tenants.mjs`
(`ownerPassword` per entry) — this doc explains them. Seeds run via
`pnpm seed:tenants` from a machine that reaches the database.

## The logins

| Property | Owner email | Initial password | Widget key | Domains |
|---|---|---|---|---|
| krishnachura-retreat (demo) | krishnachura@test.com | `krishnachura-demo-login-01` | demo-krishnachura | demo1.vivereply.com |
| seabreeze-test (fixture) | sabreeze@test.com | `seabreeze-demo-login-01` | test-seabreeze | (none — direct token until approved) |

No super-admin User row is seeded — the founder logs in via the
`ADMIN_EMAIL` + `ADMIN_PASSWORD` bootstrap (env).

## Security contract (read this)

- These passwords are COMMITTED to git. Treat them as public to
  every repo reader — that is the price of inline seed data, paid
  deliberately for demo convenience.
- Test tenants ONLY. Real tenants MUST come from public `/signup`
  (email verification + Turnstile, no temp passwords). Never seed a
  real resort's login here.
- After seeding production: log in as each owner promptly and rotate
  via Settings (first human login is forced to). Until rotated,
  anyone with repo access can use these logins.
- Re-running the seed NEVER resets an existing user's password
  (by design — the committed value must not silently restore over
  a rotation). Rotation happens in Settings.
- Seabreeze rooms mirror `demo-config/fixture.ts` exactly (slugs,
  poisha, suite ids) — the PRICE CONTRACT in the seed file. A drift
  surfaces as a totals warning on drafts.

## Automation linkage

- `EVAL_PASSWORD` = sabreeze's CURRENT password (seed value until
  first rotation, rotated value after).
- `PROBE_A_PASSWORD` / `PROBE_B_PASSWORD` = current sabreeze /
  krishnachura passwords respectively. Probes fail on stale
  passwords — update the env, not the seed, after rotating.
