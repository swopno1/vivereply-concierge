-- Phase 1 tenancy audit — READ-ONLY. Run in Supabase SQL Editor
-- (as postgres) BEFORE the Phase 1 FK migration is applied, and paste
-- the full output back into the PR. No statement below writes: SELECT
-- only. Expected runtime: seconds.
--
-- Substitutions (angle brackets — replace before running):
--   <APP_USER>  the user in the app's DATABASE_URL
--               (the string between "://" and the first ":" — e.g.
--               "postgres" in postgresql://postgres:***@...).
--               Do NOT paste the password anywhere.
--   <DEMO_ID>   the Vercel DEMO_PROPERTY_ID value for production
--               (Vercel dashboard → project → Environment Variables).

-- 0. Who runs the app, and can it bypass RLS?
--    RLS is worthless if the app connects as a bypass role. EXPECTED
--    (pre-migration): <APP_USER> listed; its rolbypassrls value decides
--    the migration order (see the PR). concierge_app must NOT exist yet.
SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('<APP_USER>', 'concierge_app', 'postgres', 'service_role')
ORDER BY rolname;

-- 1. Baseline: which FK constraints exist today?
--    EXPECTED: only User.propertyId → Property (+ Conversation/User
--    child cascades). Everything in section 3 must be absent.
SELECT conname AS fk, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY conname;

-- 2. Phase 0 carry-over: does PasswordResetToken exist in live?
--    EXPECTED: one row, to_regclass NOT NULL. If NULL, the founder
--    never ran db push for it — say so in the PR instead of assuming.
SELECT to_regclass('"PasswordResetToken"') AS password_reset_token_table;
SELECT COUNT(*) AS password_reset_token_rows FROM "PasswordResetToken";

-- 3. Demo row: does the explicit demo Property row exist?
--    EXPECTED (Task 3 gate): exactly one ACTIVE row for <DEMO_ID>.
--    If zero, the demo serves today only via code fallbacks — the seed
--    step in the PR must run BEFORE deploy, or signed-out chat 403s.
SELECT id, name, status FROM "Property" WHERE id = '<DEMO_ID>';

-- 4. Orphan audit: every row whose propertyId has no Property row.
--    EXPECTED: all counts 0. Any nonzero row BLOCKS the FK migration —
--    do not proceed; paste the output for founder-approved backfill.
--    (Ids only, no content — enough to identify rows for the decision.)
SELECT 'Conversation' AS t, COUNT(*) AS orphans FROM "Conversation" c LEFT JOIN "Property" p ON p.id = c."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'BridgeToken', COUNT(*) FROM "BridgeToken" b LEFT JOIN "Property" p ON p.id = b."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'RoomMapping', COUNT(*) FROM "RoomMapping" r LEFT JOIN "Property" p ON p.id = r."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'PropertyBinding', COUNT(*) FROM "PropertyBinding" b LEFT JOIN "Property" p ON p.id = b."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'KnowledgeDocument', COUNT(*) FROM "KnowledgeDocument" d LEFT JOIN "Property" p ON p.id = d."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'PropertyProfile', COUNT(*) FROM "PropertyProfile" p2 LEFT JOIN "Property" p ON p.id = p2."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'OnboardingRun', COUNT(*) FROM "OnboardingRun" o LEFT JOIN "Property" p ON p.id = o."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'ApprovedDomain', COUNT(*) FROM "ApprovedDomain" a LEFT JOIN "Property" p ON p.id = a."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'RateBucket', COUNT(*) FROM "RateBucket" r LEFT JOIN "Property" p ON p.id = r."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'WidgetOpen', COUNT(*) FROM "WidgetOpen" w LEFT JOIN "Property" p ON p.id = w."propertyId" WHERE p.id IS NULL UNION ALL
SELECT 'AuditLog', COUNT(*) FROM "AuditLog" a LEFT JOIN "Property" p ON p.id = a."propertyId" WHERE a."propertyId" IS NOT NULL AND p.id IS NULL UNION ALL
SELECT 'User', COUNT(*) FROM "User" u LEFT JOIN "Property" p ON p.id = u."propertyId" WHERE u."propertyId" IS NOT NULL AND p.id IS NULL;

-- 5. Orphan ids (only rows that exist — empty is the expected result).
SELECT 'Conversation' AS t, c.id, c."propertyId" FROM "Conversation" c LEFT JOIN "Property" p ON p.id = c."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'BridgeToken' AS t, b.id, b."propertyId" FROM "BridgeToken" b LEFT JOIN "Property" p ON p.id = b."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'RoomMapping' AS t, r.id, r."propertyId" FROM "RoomMapping" r LEFT JOIN "Property" p ON p.id = r."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'PropertyBinding' AS t, b.id, b."propertyId" FROM "PropertyBinding" b LEFT JOIN "Property" p ON p.id = b."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'KnowledgeDocument' AS t, d.id, d."propertyId" FROM "KnowledgeDocument" d LEFT JOIN "Property" p ON p.id = d."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'PropertyProfile' AS t, p2.id, p2."propertyId" FROM "PropertyProfile" p2 LEFT JOIN "Property" p ON p.id = p2."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'OnboardingRun' AS t, o.id, o."propertyId" FROM "OnboardingRun" o LEFT JOIN "Property" p ON p.id = o."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'ApprovedDomain' AS t, a.id, a."propertyId" FROM "ApprovedDomain" a LEFT JOIN "Property" p ON p.id = a."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'RateBucket' AS t, r."propertyId", r."windowStart" FROM "RateBucket" r LEFT JOIN "Property" p ON p.id = r."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'WidgetOpen' AS t, w.id, w."propertyId" FROM "WidgetOpen" w LEFT JOIN "Property" p ON p.id = w."propertyId" WHERE p.id IS NULL LIMIT 5;
SELECT 'AuditLog' AS t, a.id, a."propertyId" FROM "AuditLog" a LEFT JOIN "Property" p ON p.id = a."propertyId" WHERE a."propertyId" IS NOT NULL AND p.id IS NULL LIMIT 5;
SELECT 'User' AS t, u.id, u."propertyId" FROM "User" u LEFT JOIN "Property" p ON p.id = u."propertyId" WHERE u."propertyId" IS NOT NULL AND p.id IS NULL LIMIT 5;

-- 6. Child-table sanity (FKs should already enforce these — nonzero
--    means live drifted from the schema, and db push never created them).
SELECT 'Message', COUNT(*) FROM "Message" m LEFT JOIN "Conversation" c ON c.id = m."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'ToolCallLog', COUNT(*) FROM "ToolCallLog" t LEFT JOIN "Conversation" c ON c.id = t."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'HandoffRecord', COUNT(*) FROM "HandoffRecord" h LEFT JOIN "Conversation" c ON c.id = h."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'HandoffNote', COUNT(*) FROM "HandoffNote" n LEFT JOIN "HandoffRecord" h ON h.id = n."handoffId" WHERE h.id IS NULL UNION ALL
SELECT 'KnowledgeChunk', COUNT(*) FROM "KnowledgeChunk" k LEFT JOIN "KnowledgeDocument" d ON d.id = k."documentId" WHERE d.id IS NULL UNION ALL
SELECT 'ChatRating', COUNT(*) FROM "ChatRating" r LEFT JOIN "Conversation" c ON c.id = r."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'DraftClaim', COUNT(*) FROM "DraftClaim" d LEFT JOIN "Conversation" c ON c.id = d."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'Session', COUNT(*) FROM "Session" s LEFT JOIN "User" u ON u.id = s."userId" WHERE s."userId" IS NOT NULL AND u.id IS NULL;
