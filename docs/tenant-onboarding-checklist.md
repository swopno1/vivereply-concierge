# Tenant onboarding checklist

One path in: public signup (`/signup` — the owner proves the email via
link before configuring anything). The retired team-registration page
(`/admin/register`, deleted) survives only as the seed file for test
tenants. Follow top to bottom; each step states where it happens
and how to verify it.

## 1. Register (owner `/signup`)

- Resort name, owner email, owner-chosen password (Turnstile-guarded).
- No temp password — the owner chose their own; they verify email
  instead. Until verified, configuration stays locked.
- Verify: property row `ACTIVE`, owner row present, `emailVerified`
  set after the link click.

## 2. Owner first login (owner)

- Owner logs in with the password they chose at signup. (The old temp-
  password banner applies only to seed-file test accounts, never to
  signup owners — if a signup owner sees it, something is wrong.)
- Verify: login works; no password banner for signup owners.

## 3. Business profile (owner, `/onboarding`)

- Business form + reply identity (name, tone, languages, greeting).
- Website and/or documents, then submit. Watch the run card to
  `complete`; on failure read the run's `error` before retrying
  (re-runs need super-admin approval in `/settings`, Onboarding re-runs room).
- Verify: run `complete`, `chunks_written > 0`; ask a grounded
  question in chat and confirm the answer cites the new corpus.

## 4. Backend wiring (owner, `/settings`)

- Suite connection: base URL + key, then **Test** — green before
  proceeding. Keys encrypt at rest; the UI never shows them again.
- Room catalogue: seed from the Suite or add rows; every room the
  chatbot may sell must exist here with live price/currency.
- Verify: test-connection green; catalogue lists the sellable rooms.

## 5. Website wiring (owner + their webmaster)

- Chat widget: approve each host in Settings, paste the snippet
  (`widget.js` + `data-key`). No secrets on the client site.
- Staff widget (optional): mint a bridge key in Settings (shown
  once → client **server** env), server mints embed tokens per page
  load, iframe the `/staff/embed` URL.
- Verify: handshake from the real host returns a token; a test chat
  quotes a real room; a group-rate question lands in `/staff`.

## 6. Go-live checks (super-admin)

- `pnpm probes -- --probe=suspend-killswitch` is NOT run against a
  live tenant — instead confirm: property `ACTIVE`, owner login
  works, widget handshake green, one real quote + one handoff in
  `/staff`, RAG answers grounded (no "I don't know" on documented
  facts).
- No seed users in prod: the seed file's test logins
  (`docs/seed-users.md`) must NOT exist in the production database.
  Check with `SELECT email FROM "User" WHERE email LIKE '%@test.com';`
  — expect zero rows. If a seed login exists, rotate its password
  immediately (Settings → Tenants → deactivate, then have the owner
  re-register via `/signup`) and record the rotation below.
- Record: property id, go-live date, owner email, seed-check result
  in the evidence log.
