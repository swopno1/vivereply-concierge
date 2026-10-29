# Isolation-incident runbook (suspected cross-tenant leak)

Trigger: a failing isolation probe, a tenant report ("I saw another
resort's data"), or an anomalous log line. Work in order; record
times as you go.

## 1. Contain (minutes)

- If a specific tenant is the suspected SOURCE or VICTIM, suspend
  it per `tenant-suspension.md`. Suspension is non-destructive and
  instantly reversible — contain first, diagnose second.
- If the suspect is a code path (not a tenant), note the deploy;
  do not roll back yet — a rollback destroys the evidence state.

## 2. Establish facts (SQL, read-only)

```sql
-- which conversations did the victim property's chats touch?
SELECT id, "propertyId", "createdAt" FROM "Conversation"
WHERE "propertyId" = 'VICTIM' ORDER BY "createdAt" DESC LIMIT 50;
-- which chunks grounded those turns? (RAG turns log their chunks)
SELECT t."conversationId", t."createdAt", t.output
FROM "ToolCallLog" t JOIN "Conversation" c ON c.id = t."conversationId"
WHERE c."propertyId" = 'VICTIM' AND t.output::text LIKE '%chunks%'
ORDER BY t."createdAt" DESC LIMIT 20;
-- handoffs: do any carry another property's id or foreign room names?
SELECT h.id, c."propertyId", h.reason, h.createdAt
FROM "HandoffRecord" h JOIN "Conversation" c ON c.id = h."conversationId"
WHERE c."propertyId" IN ('VICTIM', 'SOURCE') ORDER BY h.createdAt DESC LIMIT 50;
```

- `ToolCallLog.output` on grounding turns records the retrieved
  chunk titles — the authoritative answer to "what grounded what".
- Check `ModelCallLog` rows for the same window (reasoning
  summaries) if the mechanism is unclear.

## 3. Classify

- **Real leak:** foreign rows/titles in the victim's scope. Find
  the query (candidate: a `where` missing `propertyId`), fix,
  re-run the FULL probe suite green, resume the tenant, disclose
  to the affected tenant (what, when, scope).
- **Probe/false alarm:** evidence shows clean scoping. Fix the
  probe or its data, re-run green, resume, record the lesson.
- **Inconclusive:** keep the tenant suspended, escalate (second
  pair of eyes on the queries), do not resume on a guess.

## 4. Close out

- Evidence log entry: trigger, timeline, classification, fix
  commit, probe run id. If real: tenant disclosure note.
- Add a regression: the incident's exact shape becomes probe #11+
  (extend `probes/run.mjs`), so it can never recur silently.
