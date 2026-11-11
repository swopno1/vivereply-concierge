-- 2FA RLS policy for RecoveryCode (companion to Phase 1 policies).
-- Run ONCE as postgres (Supabase SQL Editor) AFTER `prisma db push`
-- creates the table. Re-runnable. Recovery codes inherit tenancy from
-- their User row (EXISTS), like the other token tables — and like them,
-- every app read/write goes through the marked service path (token
-- lifecycle), so this policy is backstop, not gate. The app role needs
-- no new GRANTs (Phase 1 §A covered all tables + future tables).
ALTER TABLE "RecoveryCode" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RecoveryCode";
CREATE POLICY tenant_isolation ON "RecoveryCode" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "RecoveryCode"."userId" AND u."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "RecoveryCode"."userId" AND u."propertyId" = current_setting('app.tenant_id', true)));

-- Verify (expect 1 row):
SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'RecoveryCode';

-- Rollback: ALTER TABLE "RecoveryCode" DISABLE ROW LEVEL SECURITY;
