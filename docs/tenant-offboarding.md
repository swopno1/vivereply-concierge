# Tenant off-boarding runbook (export + delete)

Deletion is by SQL (founder only, Supabase SQL Editor). There is no
UI delete — that is deliberate until the flow has been run by hand
twice. Replace `TENANT` with the property id throughout.

## 0. Stop traffic first

Suspend per `tenant-suspension.md` and verify the 403s/401. Never
delete a live tenant — in-flight turns would half-write.

## 1. Export (handover + retention policy)

```sql
-- conversations + transcripts
SELECT * FROM "Conversation" WHERE "propertyId" = 'TENANT';
SELECT m.* FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE c."propertyId" = 'TENANT';
-- handoffs + notes, tool/usage history, config snapshot
SELECT h.* FROM "HandoffRecord" h JOIN "Conversation" c ON c.id = h."conversationId" WHERE c."propertyId" = 'TENANT';
SELECT t.* FROM "ToolCallLog" t JOIN "Conversation" c ON c.id = t."conversationId" WHERE c."propertyId" = 'TENANT';
SELECT * FROM "KnowledgeDocument" WHERE "propertyId" = 'TENANT';
SELECT * FROM "RoomMapping" WHERE "propertyId" = 'TENANT';
SELECT * FROM "PropertyBinding" WHERE "propertyId" = 'TENANT';
SELECT * FROM "ApprovedDomain" WHERE "propertyId" = 'TENANT';
-- ratings (no payment rows exist: guests pay on the resort site)
SELECT r.* FROM "ChatRating" r JOIN "Conversation" c ON c.id = r."conversationId" WHERE c."propertyId" = 'TENANT';
-- audit trail (keep the export if the contract needs a post-deletion trail)
SELECT * FROM "AuditLog" WHERE "propertyId" = 'TENANT';
```

Deliver or archive per the tenant's contract, then proceed.

## 2. Revoke access

- Bridge keys: `/settings` → Revoke each key (or
  `UPDATE "BridgeToken" SET active = false WHERE "propertyId" = 'TENANT';`).
- Owner logins: `/settings` → Tenants room → deactivate each (kills sessions, audit
  trail) — or `UPDATE "User" SET active = false WHERE "propertyId" = 'TENANT';`.

## 3. Delete (order matters — children before parents)

```sql
-- FK cascades (Phase 1) are the safety net under this order: every
-- tenant table FKs to Property with Cascade, except AuditLog which is
-- Restrict. The explicit children-first deletes below stay anyway —
-- harmless under Cascade (deleting nothing is a no-op), REQUIRED
-- under Restrict (the Property delete fails while audit rows remain),
-- and each step's row count is the visible proof of what went.
-- transcripts (cascades messages, tool logs, handoffs, handoff notes,
-- ratings, draft claims — all FK'd to Conversation)
DELETE FROM "Conversation" WHERE "propertyId" = 'TENANT';
-- knowledge (cascades chunks)
DELETE FROM "KnowledgeDocument" WHERE "propertyId" = 'TENANT';
-- config rows (FK'd with Cascade — explicit deletes retained)
DELETE FROM "BridgeToken" WHERE "propertyId" = 'TENANT';
DELETE FROM "ApprovedDomain" WHERE "propertyId" = 'TENANT';
DELETE FROM "RoomMapping" WHERE "propertyId" = 'TENANT';
DELETE FROM "PropertyBinding" WHERE "propertyId" = 'TENANT';
DELETE FROM "PropertyProfile" WHERE "propertyId" = 'TENANT';
DELETE FROM "OnboardingRun" WHERE "propertyId" = 'TENANT';
-- throttle buckets (FK'd with Cascade — explicit delete retained)
DELETE FROM "RateBucket" WHERE "propertyId" = 'TENANT';
-- audit rows (FK'd with RESTRICT — this step must run before the
-- Property delete or it fails loudly; keep the export from step 1
-- if the contract needs a trail after deletion)
DELETE FROM "AuditLog" WHERE "propertyId" = 'TENANT';
-- widget-open metrics (FK'd with Cascade, no PII — plain delete)
DELETE FROM "WidgetOpen" WHERE "propertyId" = 'TENANT';
-- logins (cascades sessions + verification/reset tokens), then the
-- property itself (cascades anything the steps above missed — except
-- audit rows, which Restrict)
DELETE FROM "User" WHERE "propertyId" = 'TENANT';
DELETE FROM "Property" WHERE id = 'TENANT';
-- attempt rows carry email only (no FK, no property): remove by owner email(s)
DELETE FROM "LoginAttempt" WHERE email IN ('owner@example.com');
DELETE FROM "SignupAttempt" WHERE email IN ('owner@example.com');
-- uploaded files live under the property prefix in storage
DELETE FROM storage.objects WHERE bucket_id = 'onboarding-uploads' AND name LIKE 'TENANT/%';
```

## 4. Verify zero orphans (all counts must be 0)

```sql
SELECT 'Property', COUNT(*) FROM "Property" WHERE id = 'TENANT' UNION ALL
SELECT 'Conversation', COUNT(*) FROM "Conversation" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'KnowledgeDocument', COUNT(*) FROM "KnowledgeDocument" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'User', COUNT(*) FROM "User" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'BridgeToken', COUNT(*) FROM "BridgeToken" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'RoomMapping', COUNT(*) FROM "RoomMapping" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'PropertyBinding', COUNT(*) FROM "PropertyBinding" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'PropertyProfile', COUNT(*) FROM "PropertyProfile" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'OnboardingRun', COUNT(*) FROM "OnboardingRun" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'ApprovedDomain', COUNT(*) FROM "ApprovedDomain" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'RateBucket', COUNT(*) FROM "RateBucket" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'WidgetOpen', COUNT(*) FROM "WidgetOpen" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'AuditLog', COUNT(*) FROM "AuditLog" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'Message(orphan)', COUNT(*) FROM "Message" m LEFT JOIN "Conversation" c ON c.id = m."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'ToolCallLog(orphan)', COUNT(*) FROM "ToolCallLog" t LEFT JOIN "Conversation" c ON c.id = t."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'HandoffRecord(orphan)', COUNT(*) FROM "HandoffRecord" h LEFT JOIN "Conversation" c ON c.id = h."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'HandoffNote(orphan)', COUNT(*) FROM "HandoffNote" n LEFT JOIN "HandoffRecord" h ON h.id = n."handoffId" WHERE h.id IS NULL UNION ALL
SELECT 'Chunk(orphan)', COUNT(*) FROM "KnowledgeChunk" k LEFT JOIN "KnowledgeDocument" d ON d.id = k."documentId" WHERE d.id IS NULL UNION ALL
SELECT 'ChatRating(orphan)', COUNT(*) FROM "ChatRating" r LEFT JOIN "Conversation" c ON c.id = r."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'DraftClaim(orphan)', COUNT(*) FROM "DraftClaim" d LEFT JOIN "Conversation" c ON c.id = d."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'Session(user-orphan)', COUNT(*) FROM "Session" s LEFT JOIN "User" u ON u.id = s."userId" WHERE s."userId" IS NOT NULL AND u.id IS NULL;
```

Record the deletion (date, tenant, export location) in the evidence log.
