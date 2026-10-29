# Tenant-isolation decisions (recorded 2026-10-29)

Deferred or structural choices the runbooks depend on. One entry each:
what, why, what would reverse it. No entry, no reliance.

## 1. Attested domains for invite-only (DECIDED)

Every tenant is registered by the Vivereply team, who types the
tenant's domains into `/admin/register` (or seed). No DNS proof of
ownership is required: a false attestation is a team keystroke error,
not a remote attack, and the blast radius is one tenant's own widget.

Reverse if: self-serve registration opens. Then require DNS TXT
(or file) proof before a domain activates, per the isolation
checklist's item 8.

## 2. Row-level security scheduled, not shipped (DEFERRED)

Enforcement today is app-layer `propertyId` scoping, proven by the
`pnpm probes` suite. RLS is the scheduled second layer because
flipping it under a live demo risks breaking legitimate reads, and
unproven RLS is weaker than proven app scoping.

Design sketch (post-hackathon): non-bypass app role + `SET LOCAL
app.tenant_id` per transaction + policies matching `propertyId` on
every tenant table; the probe suite re-run against the enforcing
role is the acceptance gate. Service-role paths (migrations, the
off-boarding SQL) stay bypass by design.

Reverse if (ship sooner): a probe ever fails on a real boundary —
that proves the app layer leaked and RLS becomes urgent.

## 3. Hard delete via runbook, no soft-delete (DECIDED)

Off-boarding deletes rows (`tenant-offboarding.md`) rather than
flagging `DELETED`: retention is the export step, and no query must
remember to exclude the dead. Suspension (`INACTIVE`) covers every
"keep data, stop traffic" need.

Reverse if: a tenant contract requires timed retention (delete
after N days) — then add `deletedAt` + a sweeper, and re-prove the
probes against the new state.
