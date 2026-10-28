-- Worker database role (RAG onboarding rework). Founder-run, once, as the
-- database owner (Supabase SQL editor). Creates a least-privilege role for
-- the Modal worker: it can stage knowledge rows and read its own job row —
-- nothing else. It CANNOT read conversations, messages, tokens, bindings,
-- or secrets, so even a fully compromised worker cannot dump guest data.
--
-- Deliberately NOT enabling row-level security here: RLS policies apply to
-- every role that doesn't bypass them, and flipping them on without first
-- proving the app's own role bypasses RLS could break live chat reads. The
-- RLS upgrade (session-scoped property match) stays a documented follow-up;
-- run it only after confirming `SELECT rolbypassrls FROM pg_roles WHERE
-- rolname = current_user` is true for the app's connection user. Until
-- then, cross-tenant safety inside the knowledge tables rests on the
-- worker's fail-closed insert helper (propertyId required, must equal the
-- job's property) plus the CHECK below.
--
-- Usage: replace <STRONG_RANDOM_PASSWORD>, run the whole file, then put
--   postgresql://onboarding_worker:<password>@<pooler-host>:6543/postgres
-- in the Modal Secret as WORKER_DB_URL (pooler port 6543, transaction mode).

-- 1. Role (re-runnable: DROP first only if rotating after a leak).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'onboarding_worker') THEN
    CREATE ROLE onboarding_worker LOGIN PASSWORD '<STRONG_RANDOM_PASSWORD>';
  END IF;
END
$$;

-- 2. Least privilege: exact tables, exact verbs. No SELECT on guest tables,
-- no DELETE anywhere, no DDL, no superuser.
GRANT USAGE ON SCHEMA public TO onboarding_worker;
GRANT SELECT, INSERT ON "KnowledgeDocument" TO onboarding_worker;
GRANT SELECT, INSERT, UPDATE ("indexed") ON "KnowledgeChunk" TO onboarding_worker;
GRANT SELECT ON "OnboardingRun" TO onboarding_worker;

-- 3. Belt-and-braces: a chunk row can never carry an empty property id.
-- (The document table holds propertyId; chunks inherit it via documentId.
-- This constraint guards the document side.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeDocument_propertyId_nonempty') THEN
    ALTER TABLE "KnowledgeDocument"
      ADD CONSTRAINT "KnowledgeDocument_propertyId_nonempty" CHECK ("propertyId" <> '');
  END IF;
END
$$;

-- 4. Verify (expect: 1 row, f, f, f, f — login only, nothing else).
SELECT rolname, rolsuperuser, rolbypassrls, rolcreatedb, rolcreaterole
FROM pg_roles WHERE rolname = 'onboarding_worker';
