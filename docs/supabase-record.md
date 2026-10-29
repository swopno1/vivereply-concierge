# Supabase record (project facts)

One page answering "where is the database and how do we recover it".
Values below marked [FOUNDER] must be filled from the Supabase
dashboard — they are not observable from this repo.

## Project

- Project ref: [FOUNDER] (dashboard URL contains it:
  `supabase.com/dashboard/project/<ref>`)
- Region: [FOUNDER] (Settings → General → Region; closest to the
  guests is ap-south / ap-southeast for Bangladesh resorts)
- Postgres version: [FOUNDER] (Settings → General)
- Pooling: Supabase pooler (`aws-0-….pooler.supabase.com:5432`) for
  `DATABASE_URL`; direct connection for `DIRECT_URL`
- Extensions: `vector` (pgvector — required before `prisma db push`;
  see evidence log for the "type vector does not exist" fix)

## Backups / PITR

- Plan: [FOUNDER] (Free = daily backups, 7-day retention, no PITR;
  Pro = PITR available — confirm what is actually enabled)
- PITR enabled: [FOUNDER] yes/no (Database → Backups)
- Last restore drill: never run — schedule one before the first real
  tenant (restore to a branch/preview, confirm the app boots
  read-only against it, tear down)

## Access

- App role: connection string in Vercel env (`DATABASE_URL`); full
  schema access via Prisma
- Worker role: least-privilege `onboarding_worker` (grants in
  `docs/worker-db-role.sql`; password lives only in the Modal
  secret `vivereply-onboarding` as `WORKER_DB_URL`)
- Service key (`SUPABASE_SERVICE_KEY`): server-side only — storage
  signing for onboarding uploads. Never in the browser, never in git.
- RLS: NOT enabled — isolation is app-enforced (every query scoped
  by propertyId; see `tenant-isolation-decisions.md`). Enabling RLS
  is the post-hackathon hardening step; do not flip it on without
  the policy set, or the app breaks closed.

## Storage

- Bucket `onboarding-uploads`: private; uploads via signed URLs from
  `/api/admin/onboarding/uploads`; objects prefixed `TENANT/…` and
  deleted by the offboarding SQL
