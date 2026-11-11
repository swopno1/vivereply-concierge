-- Phase 3 RLS — Subscription + BillingNotice tenant policies, StripeEvent
-- service-only. Run ONCE as postgres (Supabase SQL Editor) AFTER `prisma db
-- push` creates the tables. Re-runnable. Subscription/BillingNotice carry
-- propertyId directly (same USING/WITH CHECK shape as Phase 1 §B).
-- StripeEvent gets RLS enabled with NO policy: no app-role access at all
-- (the webhook's service client runs as the bypass role, which skips RLS
-- by role attribute — that is the only path that touches this table).
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Subscription";
CREATE POLICY tenant_isolation ON "Subscription" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "BillingNotice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BillingNotice";
CREATE POLICY tenant_isolation ON "BillingNotice" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "StripeEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StripeEvent";

-- Verify (expect 2 rows; StripeEvent must NOT appear):
SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename IN ('Subscription', 'BillingNotice', 'StripeEvent');

-- Rollback: ALTER TABLE "Subscription" DISABLE ROW LEVEL SECURITY;
--            ALTER TABLE "BillingNotice" DISABLE ROW LEVEL SECURITY;
--            ALTER TABLE "StripeEvent" DISABLE ROW LEVEL SECURITY;
