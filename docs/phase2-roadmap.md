# Phase 2 roadmap (post-hackathon — do not start before Nov 10)

Buildable detail per phase: [2A WhatsApp + inbox](phase2/2A-whatsapp-unified-inbox.md) ·
[2B Luxury feel](phase2/2B-luxury-feel.md) · [2C Messenger](phase2/2C-messenger.md) ·
[2D Domain packs](phase2/2D-domain-packs.md). This page stays the index and the order.

## Goal

Turn the widget-only resort Concierge into a 3-channel (web, WhatsApp,
Messenger), multi-vertical guest platform — in an order where each
phase funds the next. Channels sell the next 10 resorts, luxury feel
keeps them, Messenger is cheap after WhatsApp, and new domains start
only once resorts pay.

## Success Criteria

- A guest completes quote→draft→pay-link entirely inside WhatsApp.
- Staff work one inbox with channel badges; no handoff waits silently.
- A mystery guest can't distinguish the bot's first 3 turns from a
  good human agent; every failure ends in a human, never a dead end.
- One non-resort vertical (bus/ship ticketing) live with a design
  partner and its own ≥15-case eval pack.
- None of Phase 2 starts before: pricing live, per-tenant quotas +
  spend alerts enforced, DPA/TOS ready, uptime monitor pinging, one
  pilot resort referenceable.

## Approach

One channel abstraction under one Meta app (WhatsApp first, Messenger
second — same webhooks, same verification, same review). The agent
core (loop, guards, RAG, tools) doesn't change; RENDER does (no
cards/SSE on messaging channels: text + links + native interactive
elements). Webhooks must answer 200 fast (Messenger: ≤5s), so inbound
turns run async (ack → queue/worker → reply), never inline. New
verticals ship as PACKS (tools + prompt + catalogue + eval + adapter
spec) on the unchanged core — packs, not forks.

## Steps

### 2A. WhatsApp + unified staff inbox (the revenue phase)

- Meta infra: Business Platform (Cloud API) app, phone number ID,
  webhook verify-token + signature verification (fail closed, like
  the Stripe signature), template pack submitted early (booking
  confirmation, payment receipt, pre-arrival reminder — approval
  takes 24–48h, so file on day one).
- `lib/channels/whatsapp/`: inbound normalize (text/media/location →
  internal turns), outbound render (short replies, link buttons,
  list messages for room options), opt-in/out handling (STOP honored,
  quiet hours per resort timezone).
- Async turn pipeline: webhook acks 200 immediately, enqueues;
  worker runs the agent and replies via Cloud API. Retries with
  idempotency (dedupe on Meta message ID — webhooks redeliver).
- Money + compliance: per-message pricing is business→user only,
  charged on DELIVERED (service replies inside the 24h window;
  templates outside it). Pricing worksheet gains a channel-cost
  line; quotas count WA messages, not just turns.
- Staff inbox: /staff gains channel badges + reply-into-chat +
  notifications (the missing pieces this phase exists to close).
- Validate: full booking flow inside WhatsApp E2E on a test number;
  template reminder arrives; abuse of the webhook yields no data
  and no spend; `pnpm test` + typecheck green; new channel tests
  committed (normalize/render/unit, no live sends).

### 2B. Luxury feel (the pricing-power phase)

- White-label Appearance room (colors, logo, voice) — no Concierge
  chrome on premium tiers.
- Proactive engine: Suite events → guest messages (confirmed,
  receipt, 3-day pre-arrival upsell, checkout thanks) via templates.
- Personalization: guest identity (phone-linked) + preferences
  store ("the quiet room you liked last time").
- Service recovery: frustration signals (repeat question, complaint
  words, 2 tool errors/turn) → priority handoff, guest told a human
  is coming.
- Languages +Hindi, Arabic, Chinese with native review.
- Validate: mystery-guest script (3-turn indistinguishability);
  failed-turn→human drill; template delivery receipts in log.

### 2C. Messenger (the cheap-after-WA phase)

- Same Meta app + adapter shape: Page install, webhook subscribe,
  PSID→Conversation identity, render parity with WhatsApp.
- Validate: same E2E flow on a test Page; Advanced Access + App
  Review completed for production senders.

### 2D. Domain packs (the expansion phase — LAST)

- Core stays; each vertical = tool definitions + prompt section +
  catalogue shape + ≥15-case eval pack + adapter spec mirroring
  suite-api-spec (search/hold/confirm).
- Order: bus/ship ticketing (simplest, huge local volume) →
  travel operators (human quote-approval step) → doctor
  appointments (last: sensitive data, DPA + health-data review).
- Rule: one vertical at a time, each with a signed design partner.
  A pack without a partner is a hobby.
- Validate: per-vertical eval pack green; partner's first real
  transaction logged; no resort regression (full suite re-run).

## Validation Plan

- Every phase: `pnpm test`, `pnpm typecheck`, production build,
  plus channel E2E on test numbers/Pages (never mocks alone).
- Highest-risk validation: the async webhook pipeline under
  redelivery (duplicate Meta events must never double-reply or
  double-book — idempotency on message ID + conversation key).
- Business gates between phases: 2A needs 3 paying resorts to fund
  2B; 2D needs resort profit, not just revenue.

## Risks / Open Questions

- Meta per-message rates vary by market/category — Bangladesh
  service/utility rates must be read off the live rate card before
  pricing WA tiers (no number is quoted here).
- Webhook ack budget (≤5s) rules out inline agent turns — the async
  worker is load-bearing, not optional.
- Template rejections (marketing-vs-utility miscategorization) can
  stall 2A by days — file early, keep a backup template set.
- Identity linking across channels is v1-linked-history, not live
  continuity — say so in product copy, don't imply magic.
- Non-goals: voice/phone before WhatsApp pays; new verticals before
  resort revenue; core rewrites per vertical; ANY of this before
  submission-nov4 + freeze.

## Sources

- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
