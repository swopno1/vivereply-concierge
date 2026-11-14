-- R1 assistant tables (Handover R1). Run ONCE as postgres, with the app
-- deploy that adds them (same window as `prisma db push`). Fully
-- re-runnable. Existing policies untouched.
--
-- AssistantUnanswered follows the StripeEvent precedent: RLS enabled with
-- NO tenant policy, so only the bypass (service) role touches it. All
-- reads/writes go through service paths in super-admin-gated contexts.
-- KnowledgeDocument needs no policy change: its tenant_isolation policy
-- matches propertyId = tenant, and platform rows (NULL propertyId) never
-- match — tenants cannot see them even if tenant code forgets the filter.

ALTER TABLE "AssistantUnanswered" ENABLE ROW LEVEL SECURITY;
-- NOTE: deliberately no CREATE POLICY here (service-only table).
