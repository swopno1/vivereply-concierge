-- Phase 1 RLS §A — roles + grants + index. Run ONCE as postgres
-- (Supabase SQL Editor) BEFORE the app deploy, AFTER `prisma db push`
-- for the FK relations. Fully re-runnable. This step grants nothing
-- that changes query results (no policies yet) — it only prepares the
-- role the deployed app will connect as.
--
-- Deploy order (the full sequence lives in the PR + decisions doc):
--   1. Phase 1 orphan audit clean (prisma/sql/phase1-tenancy-audit.sql).
--   2. `prisma db push` (FK relations; additive, validated by the audit).
--   3. THIS FILE (§A: role + grants + index).
--   4. Founder sets the concierge_app password (below) + Vercel envs
--      (DATABASE_URL user → concierge_app, SERVICE_DATABASE_URL set).
--   5. Deploy the app (sets app.tenant_id; harmless while §B is pending).
--   6. prisma/sql/phase1-rls-policies.sql (§B: enable RLS + policies).
--   7. Probes green (10/10) + unset-tenant fail-closed proof.
-- Rollback: revert the app deploy (old code connects as the old bypass
-- user, which ignores policies entirely). Optionally disable RLS per
-- table afterwards; the policies file lists the statements.

-- The ONLY role the runtime tenant path uses. NOBYPASSRLS is explicit
-- (the Postgres default for new roles — stated so no reader has to
-- know that). LOGIN because the app connects with it. The postgres
-- superuser stays the bypass service role (migrations, offboarding
-- SQL, founder console) — no second role to create.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'concierge_app') THEN
    CREATE ROLE concierge_app WITH LOGIN NOBYPASSRLS;
  END IF;
END $$;

-- Password: set it OUTSIDE this file (never commit it). Founder runs:
--   ALTER ROLE concierge_app WITH PASSWORD '<generated>';
-- then points the app's DATABASE_URL at concierge_app (Vercel env).

-- Grants: RLS policies filter rows, but the role still needs table
-- privileges — without these, every query fails closed even with the
-- tenant set. ALL on everything EXCEPT Property (SELECT-only: tenant
-- paths never legitimately write the registry — signup and the admin
-- properties route use the bypass service path — so a compromised app
-- role still cannot drop or rewrite tenants).
-- (Supabase default database is `postgres`; if this errors, substitute
-- the real database name — a wrong name fails loudly here, not silently.)
GRANT CONNECT ON DATABASE postgres TO concierge_app;
GRANT USAGE ON SCHEMA public TO concierge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO concierge_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO concierge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO concierge_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO concierge_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE "Property" FROM concierge_app;

-- RLS + FK join support: every other tenant table already indexes
-- propertyId (unique or @@index); Conversation is the one that does
-- not. Small table, plain CREATE INDEX is instant; IF NOT EXISTS
-- keeps this file re-runnable.
CREATE INDEX IF NOT EXISTS "Conversation_propertyId_idx" ON "Conversation"("propertyId");

-- Verify (expect: one row, f/f/t):
SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'concierge_app';
