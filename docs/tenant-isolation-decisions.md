# Tenant-isolation decisions (recorded 2026-10-29)

Deferred or structural choices the runbooks depend on. One entry each:
what, why, what would reverse it. No entry, no reliance.

## 1. Attested domains, kept under public signup (DECIDED, revised 2026-10-29)

Self-serve registration exists now (`/signup`), so the original
"invite-only" premise is gone — but attested domains stand. Reason:
approving victim.com under YOUR property is harmless without script
injection on victim.com (which the attacker would need anyway); the
handshake binds key + approved host, so a false attestation can only
ever serve the attacker's own widget to the attacker's own pages.
The real signup abuse (bulk fake tenants) is handled instead by
Turnstile + throttles + email verification gating configuration.

Reverse if: a concrete attack appears where attestation (not
injection) is the pivot — then require DNS TXT proof before a
domain activates.

## 2. Row-level security as the second layer (SHIPPED 2026-11-11, Phase 1)

App-layer `propertyId` scoping (proven by `pnpm probes`) stays the
primary enforcement — every query keeps its explicit filter. RLS is
the second layer that makes a missing filter fail closed instead of
leaking: 22 tables, one `tenant_isolation` policy each, matching
`propertyId = current_setting('app.tenant_id', true)` directly or
via EXISTS on the parent. An unset tenant sees nothing, never
everything.

Design as built (the hard problem was the pooled client — one
PrismaClient over a max-5 pg Pool on the transaction-mode pooler,
where `SET LOCAL` only lives for one transaction on one
connection):
- `withTenant(propertyId, fn)` (lib/tenant-db.ts) runs fn inside ONE
  interactive transaction that sets the tenant first — setting and
  queries share a connection by construction, and SET LOCAL dies
  with the transaction, so a returned connection can never serve
  the next tenant with a stale id (PgBouncer post-transaction reset
  is defense in depth, not relied upon).
- Helpers that take a verified propertyId wrap their own queries;
  routes wrap only their DIRECT queries; nesting throws (guard in
  withTenant). No transaction is ever held across network/LLM calls
  (chat is segmented load/compute/save) — the pool would starve.
- App connects as `concierge_app` (NOBYPASSRLS, created by
  prisma/sql/phase1-rls-roles.sql); SELECT-only on Property, full
  grants elsewhere. Bypass paths use the separate service client
  (SERVICE_DATABASE_URL), explicitly marked `SERVICE PATH` at every
  call site: auth bootstrap (login/signup/verify/reset user, token
  and session ops), getSession's session-row read, session
  lifecycle, super-admin cross-property reads, widget-key
  resolution, worker callback, seeds, migrations, offboarding SQL.
- Super-admin rule: acting on ONE property sets that property as
  the tenant (validated request id); cross-property reads (Tenants
  list, audit trail) go through the marked service path only —
  never by leaving the tenant unset on the app role.
- Out of RLS, deliberately: Property (bootstrap registry — tenant
  validation precedes establishment; non-sensitive columns),
  IpRateBucket (global throttle, no property), LoginAttempt /
  SignupAttempt (abuse logs keyed by email/IP).
- Deploy order (zero-downtime): orphan audit → db push (FKs) →
  §A roles/grants → Vercel envs (DATABASE_URL user, password,
  SERVICE_DATABASE_URL) → deploy app (sets tenant, harmless
  pre-policies) → §B policies → probes. Rollback: revert deploy
  (old code as the bypass user ignores policies).

Reverse if: interactive transactions prove unworkable through the
pooler in production (pool starvation or scope errors under load
that the probes did not catch) — then disable RLS per the rollback
block in phase1-rls-policies.sql and fall back to app-layer-only
scoping while redesigning.

## 3. Hard delete via runbook, no soft-delete (DECIDED)

Off-boarding deletes rows (`tenant-offboarding.md`) rather than
flagging `DELETED`: retention is the export step, and no query must
remember to exclude the dead. Suspension (`INACTIVE`) covers every
"keep data, stop traffic" need.

Reverse if: a tenant contract requires timed retention (delete
after N days) — then add `deletedAt` + a sweeper, and re-prove the
probes against the new state.

## 4. Cross-tenant read statuses: 403 vs 404, split on purpose (DECIDED)

The probes expect 403 on cross-property reads of
`/api/admin/room-mappings` and `/api/admin/onboarding`, while most
id-keyed routes 404 cross-tenant reads (handoffs, bindings, rooms
by id). Both fail closed; the split is deliberate, not drift:
- Query/body-scoped routes 403 on a mismatched propertyId: the
  caller named a tenant they may not use, and the refusal says so.
- Id-keyed routes 404: the id alone must not reveal that the row
  exists (a 403 would confirm it to an enumerator).
Phase 1 preserves every expectation byte-for-byte (RLS confines the
id lookups to read-as-missing, producing the same 404s). Do not
unify the statuses without founder approval — the probe contracts
encode the split.
