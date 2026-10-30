# Phase 2A — WhatsApp + unified staff inbox (the revenue phase)

Parent: docs/phase2-roadmap.md. This is the buildable breakdown —
work items in dependency order, each with its surface and check.

## A1. Meta app + number + templates (founder, day 1 — approvals are the long pole)

- Create the Meta app, add WhatsApp Business Platform (Cloud API),
  register the phone number, record Phone Number ID.
- Request Advanced Access for production senders (App Review lead
  time starts now, not later).
- Submit the template pack day one (approval 24–48h, rejections
  common): `booking_confirmation`, `payment_receipt`,
  `pre_arrival_reminder` (utility category — file as marketing and
  it gets rejected or repriced). Keep one backup phrasing per
  template.
- Check: test number sends/receives in the Meta playground; system
  user token stored server-side only (Vercel env, never git).

## A2. Channel abstraction (code)

- New `lib/channels/types.ts`: `ChannelMessage { from, text, media?,
  replyTo? }`, `ChannelAdapter { normalize(webhookBody), render(reply,
  cards) }`. Widget keeps its own path — adapters are for messaging
  channels only.
- New `lib/channels/whatsapp/`: Cloud API client (send text,
  interactive buttons/lists, template sends), webhook verifier
  (verify-token GET + HMAC signature on POST, fail closed like the
  Stripe check in lib/payments.ts).
- Render rules: short replies (split >1000 chars), room options as
  interactive lists, pay links as URL buttons (verbatim server URL,
  never shortened), no SSE, no cards.
- Check: unit tests for normalize/render/signature with fixtures
  (no live sends in tests, ever).

## A3. Async turn pipeline (code — load-bearing)

- Webhook route acks 200 immediately (<5s budget), deduplicates on
  Meta message ID, enqueues the turn. Agent runs in a worker, reply
  goes out via Cloud API.
- Queue choice: DB-backed outbox table (`ChannelInbox`: message ID
  unique, status, attempts) drained by a Modal cron worker (reuse
  worker/ already deployed) — no new infra, survives restarts,
  retries with backoff. Vercel `waitUntil` is NOT the answer: it
  offers no retries, no dead-lettering, and no visibility — a
  booking pipeline needs all three.
- Idempotency: Meta redelivers — message-ID unique constraint drops
  dupes; booking path reuses conversation-idempotency (already in
  suite.ts), so a redelivered "yes, book it" replays the same draft.
- Check: redelivery drill (same webhook ×3 → exactly one reply, one
  draft); worker-crash drill (kill mid-turn → retry completes once).

## A4. Identity + opt-in (code + copy)

- Phone number → Conversation mapping (`ChannelIdentity` table:
  channel, remoteId, conversationId?, propertyId). Recognized phone
  links history; unknown starts a fresh thread and offers linking.
- STOP honored immediately (blocklist row, no further sends);
  business-initiated sends only inside the 24h window or via
  approved templates — enforced in the send path, not by policy.
- Check: STOP → silence proof; template-only-outside-window test.

## A5. Money + quotas (code)

- Pricing worksheet gains per-message WA costs (business→user,
  delivered-only, category×market from the live rate card).
- Quotas count WA messages alongside turns (extend the chat-route
  cost-controls TODO surface to a shared `lib/quotas.ts` both paths
  call). 80% alert + 120% stop apply to WA spend too.
- Check: dashboard shows per-property WA message counts + est. cost.

## A6. Unified staff inbox (code — the payoff)

- /staff: channel badges, WA transcripts inline, reply-into-chat per
  channel (staff text → template-or-window send), notifications on
  every handoff (email first, SMS later — pick one and ship it).
- Check: handoff from WA → staff notified <2 min → staff reply lands
  in the guest's WhatsApp. The demo that sells resort #2.

## Done when

Guest completes quote→draft→pay-link inside WhatsApp on a test
number; template reminder arrives; webhook abuse yields nothing;
full `pnpm test` + typecheck + build green; no resort regression
(19-case eval re-run).
