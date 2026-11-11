-- Phase 1 RLS §B — enable RLS + tenant policies. Run ONCE as postgres
-- (Supabase SQL Editor) AFTER the app deploy (the deployed code sets
-- app.tenant_id; running this first would blind the OLD code, which
-- never sets it). Fully re-runnable (DROP POLICY IF EXISTS).
--
-- Enforcement model: every policy matches the request tenant carried
-- in the transaction-local GUC app.tenant_id (set by the app's
-- withTenant wrapper, first statement inside the transaction).
-- current_setting(..., true) returns NULL when unset → NULL never
-- equals a propertyId → an unset tenant sees NOTHING (fail closed).
-- The postgres superuser (migrations, offboarding SQL, founder
-- console) bypasses RLS by role attribute — that is the service path.
--
-- Tables WITHOUT policies (deliberate, see the decisions doc):
--   Property (bootstrap registry; tenant validation precedes tenant
--     establishment; app role holds SELECT-only via §A grants),
--   IpRateBucket (global IP throttle, no property),
--   LoginAttempt / SignupAttempt (email/IP abuse logs, no tenant).
-- Rollback (revert app deploy first): run the DISABLE block at the end.

-- ---- helper: enable + one policy per table (direct propertyId match) ----

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Conversation";
CREATE POLICY tenant_isolation ON "Conversation" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "BridgeToken" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BridgeToken";
CREATE POLICY tenant_isolation ON "BridgeToken" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "RoomMapping" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RoomMapping";
CREATE POLICY tenant_isolation ON "RoomMapping" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "PropertyBinding" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PropertyBinding";
CREATE POLICY tenant_isolation ON "PropertyBinding" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "KnowledgeDocument" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "KnowledgeDocument";
CREATE POLICY tenant_isolation ON "KnowledgeDocument" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "PropertyProfile" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PropertyProfile";
CREATE POLICY tenant_isolation ON "PropertyProfile" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "OnboardingRun" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OnboardingRun";
CREATE POLICY tenant_isolation ON "OnboardingRun" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "ApprovedDomain" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ApprovedDomain";
CREATE POLICY tenant_isolation ON "ApprovedDomain" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "RateBucket" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RateBucket";
CREATE POLICY tenant_isolation ON "RateBucket" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "WidgetOpen" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "WidgetOpen";
CREATE POLICY tenant_isolation ON "WidgetOpen" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User" FOR ALL TO concierge_app
  USING ("propertyId" = current_setting('app.tenant_id', true))
  WITH CHECK ("propertyId" = current_setting('app.tenant_id', true));

-- ---- child tables: tenancy via EXISTS on the parent ----

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Message";
CREATE POLICY tenant_isolation ON "Message" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "Message"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "Message"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "ToolCallLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ToolCallLog";
CREATE POLICY tenant_isolation ON "ToolCallLog" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "ToolCallLog"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "ToolCallLog"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "HandoffRecord" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "HandoffRecord";
CREATE POLICY tenant_isolation ON "HandoffRecord" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "HandoffRecord"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "HandoffRecord"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "ChatRating" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ChatRating";
CREATE POLICY tenant_isolation ON "ChatRating" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "ChatRating"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "ChatRating"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "DraftClaim" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DraftClaim";
CREATE POLICY tenant_isolation ON "DraftClaim" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "DraftClaim"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Conversation" c WHERE c.id = "DraftClaim"."conversationId" AND c."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "HandoffNote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "HandoffNote";
CREATE POLICY tenant_isolation ON "HandoffNote" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "HandoffRecord" h JOIN "Conversation" c ON c.id = h."conversationId" WHERE h.id = "HandoffNote"."handoffId" AND c."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "HandoffRecord" h JOIN "Conversation" c ON c.id = h."conversationId" WHERE h.id = "HandoffNote"."handoffId" AND c."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "KnowledgeChunk" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "KnowledgeChunk";
CREATE POLICY tenant_isolation ON "KnowledgeChunk" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "KnowledgeDocument" d WHERE d.id = "KnowledgeChunk"."documentId" AND d."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "KnowledgeDocument" d WHERE d.id = "KnowledgeChunk"."documentId" AND d."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Session";
CREATE POLICY tenant_isolation ON "Session" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Session"."userId" AND u."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Session"."userId" AND u."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "EmailVerificationToken" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EmailVerificationToken";
CREATE POLICY tenant_isolation ON "EmailVerificationToken" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "EmailVerificationToken"."userId" AND u."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "EmailVerificationToken"."userId" AND u."propertyId" = current_setting('app.tenant_id', true)));

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PasswordResetToken";
CREATE POLICY tenant_isolation ON "PasswordResetToken" FOR ALL TO concierge_app
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "PasswordResetToken"."userId" AND u."propertyId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "PasswordResetToken"."userId" AND u."propertyId" = current_setting('app.tenant_id', true)));

-- Verify (expect: 22 rows, one tenant_isolation policy per table above).
SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation' ORDER BY tablename;

-- Optional 30-second enforcement proof (shows fail-closed + tenant match;
-- substitute a REAL property id; read-only SELECTs, safe on prod):
--   SET ROLE concierge_app;
--   SELECT COUNT(*) FROM "Conversation";  -- expect 0: no tenant set
--   SELECT set_config('app.tenant_id', '<REAL_ID>', false);
--   SELECT COUNT(*) FROM "Conversation";  -- expect that tenant's rows only
--   RESET ROLE;

-- Rollback (revert the app deploy first; old code as the bypass user
-- ignores policies entirely, so this is belt-and-braces):
--   ALTER TABLE "Conversation" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "BridgeToken" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "RoomMapping" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "PropertyBinding" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "KnowledgeDocument" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "PropertyProfile" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "OnboardingRun" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "ApprovedDomain" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "RateBucket" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "WidgetOpen" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "AuditLog" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "Message" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "ToolCallLog" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "HandoffRecord" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "ChatRating" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "DraftClaim" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "HandoffNote" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "KnowledgeChunk" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "Session" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "EmailVerificationToken" DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE "PasswordResetToken" DISABLE ROW LEVEL SECURITY;
