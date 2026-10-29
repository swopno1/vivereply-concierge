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
```

Deliver or archive per the tenant's contract, then proceed.

## 2. Revoke access

- Bridge keys: `/settings` → Revoke each key (or
  `UPDATE "BridgeToken" SET active = false WHERE "propertyId" = 'TENANT';`).
- Owner logins: `/settings` → Tenants room → deactivate each (kills sessions, audit
  trail) — or `UPDATE "User" SET active = false WHERE "propertyId" = 'TENANT';`.

## 3. Delete (order matters — children before parents)

```sql
-- transcripts (cascades messages, tool logs, handoffs, handoff notes)
DELETE FROM "Conversation" WHERE "propertyId" = 'TENANT';
-- knowledge (cascades chunks)
DELETE FROM "KnowledgeDocument" WHERE "propertyId" = 'TENANT';
-- config rows (no FKs — plain deletes)
DELETE FROM "BridgeToken" WHERE "propertyId" = 'TENANT';
DELETE FROM "ApprovedDomain" WHERE "propertyId" = 'TENANT';
DELETE FROM "RoomMapping" WHERE "propertyId" = 'TENANT';
DELETE FROM "PropertyBinding" WHERE "propertyId" = 'TENANT';
DELETE FROM "PropertyProfile" WHERE "propertyId" = 'TENANT';
DELETE FROM "OnboardingRun" WHERE "propertyId" = 'TENANT';
-- logins (cascades sessions), then the property itself
DELETE FROM "User" WHERE "propertyId" = 'TENANT';
DELETE FROM "Property" WHERE id = 'TENANT';
-- login-attempt rows carry email only (no FK): remove by owner email(s)
DELETE FROM "LoginAttempt" WHERE email IN ('owner@example.com');
-- uploaded files live under the property prefix in storage
DELETE FROM storage.objects WHERE bucket_id = 'onboarding-uploads' AND name LIKE 'TENANT/%';
```

## 4. Verify zero orphans (all counts must be 0)

```sql
SELECT 'Conversation', COUNT(*) FROM "Conversation" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'KnowledgeDocument', COUNT(*) FROM "KnowledgeDocument" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'User', COUNT(*) FROM "User" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'BridgeToken', COUNT(*) FROM "BridgeToken" WHERE "propertyId" = 'TENANT' UNION ALL
SELECT 'Message(orphan)', COUNT(*) FROM "Message" m LEFT JOIN "Conversation" c ON c.id = m."conversationId" WHERE c.id IS NULL UNION ALL
SELECT 'Chunk(orphan)', COUNT(*) FROM "KnowledgeChunk" k LEFT JOIN "KnowledgeDocument" d ON d.id = k."documentId" WHERE d.id IS NULL;
```

Record the deletion (date, tenant, export location) in the evidence log.
