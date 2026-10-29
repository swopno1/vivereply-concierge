# Transcript review (the prompt loop, weekly)

The eval suite guards what we already know; this loop finds what we
don't. Every week (Friday, 30 min), the founder reads 10 real turns
and turns surprises into eval cases. The triage board is ops (serve
this guest); this is product (serve the next thousand).

## 1. Sample (5 min)

Pull 10 recent turns: 5 random + 5 from conversations that ended in
a handoff or a "not helpful" rating (handoff = the agent gave up;
downvote = the guest gave up — both are gold).

```sql
-- handoff/downvote conversations first
SELECT c.id, c."propertyId", c."createdAt"
FROM "Conversation" c
LEFT JOIN "ChatRating" r ON r."conversationId" = c.id
WHERE c.status = 'HANDED_OFF' OR r.helpful = false
ORDER BY c."createdAt" DESC LIMIT 5;
-- then 5 random recent ones
SELECT id, "propertyId", "createdAt" FROM "Conversation"
ORDER BY "createdAt" DESC LIMIT 20; -- pick 5 by whim, not by pattern
```

Read each in `/staff` (transcript view) or straight from `Message`.

## 2. Look for (15 min)

- **Invents**: a price, room, date, or fact no tool/RAG row supports.
  Quote the turn verbatim in the finding.
- **Guardrail wobbles**: quote skipped, second draft offered, Suite
  total ignored, payment link paraphrased, card details repeated.
- **Tone breaks**: cold, rambling, or Bengali that reads
  machine-translated (flag for a native read, don't judge alone).
- **Tool waste**: 3+ model calls for a one-quote turn, or a tool
  error the agent didn't recover from (check ToolCallLog).
- **Citation misses**: knowledge answer with no named source (the
  prompt requires it since v4 — misses are regressions).

## 3. Act (10 min)

Every finding becomes exactly one of:

1. **An eval case** (preferred): add to `eval/cases.mjs` with checks
   that fail on the observed turn. Re-run `pnpm eval`.
2. **A prompt change**: edit RULES, bump PROMPT_VERSION with a
   changelog line, re-run eval, record in decision-log.
3. **A code fix**: guard/tool/card change + unit test, normal flow.
4. **A non-issue**: note why (one line in decision-log) so next
   week's review doesn't re-litigate it.

Log the session (date, turns read, findings, cases added) in
`docs/decision-log.md`. Zero findings is a valid outcome — write
"10 read, 0 findings" so the loop stays visible.
