# Phase 2D — Domain packs (the expansion phase — LAST)

Parent: docs/phase2-roadmap.md. Rule of the phase: the core never
forks. Each vertical is a PACK on the unchanged loop/RAG/channels/
staff/payments/identity core. One vertical at a time, each with a
signed design partner. A pack without a partner is a hobby.

## Pack anatomy (every vertical ships all five)

1. **Tool definitions** (`lib/tools/<vertical>.ts` + ToolDb surface):
   the domain's verbs. Booking's five (availability/quote/draft/
   lookup/handoff) are the template — most transactional verticals
   rhyme with them.
2. **Prompt section** (lib/prompts.ts pattern): role + rules + money
   handling + silence conditions, in every language the vertical
   launches with. PROMPT_VERSION bump + changelog, as always.
3. **Catalogue shape** (demo-config/rooms.ts pattern): the thing the
   agent may offer, per-property rows governing chat once present.
4. **Adapter spec** (docs/suite-api-spec.md pattern): search/hold/
   confirm endpoints + idempotency + 429 contract + fixture double
   for tests. No vertical ships without its fixture.
5. **Eval pack** (eval/cases.<vertical>.mjs pattern, ≥15 cases):
   happy paths, corrections, guardrails, ≥3 adversarial, money
   paths. Green before the partner's first real transaction.

## Vertical order (and why)

### D1. Bus/ship ticketing (first)

Simplest transaction, huge local volume, fixed schedules. Entities:
routes, trips, seats, PNR. Money: fixed fares (no quote-compare
depth needed). Peaks (Eid travel) are the load story — size quotas
for them. Partner profile: one regional operator with an API (or a
CSV schedule to start — fixture first, adapter second).

### D2. Travel operators (second)

Higher value, messier: packages, custom itineraries, multi-day,
human judgment. The pack's signature feature is HUMAN QUOTE
APPROVAL: agent drafts the itinerary + price, operator confirms in
/staff, guest gets the confirmed version. Never let the model
finalize a custom price. Partner profile: one Cox's Bazar operator
doing packages by hand today.

### D3. Doctor appointments (third and last)

Regulated-adjacent: sensitive data, no-show workflows, reminders,
strictest privacy. Additional requirements beyond the pack anatomy:
signed DPA before first real patient, health-data handling review
(what is stored, who reads it, retention), reminder templates
(24h + 1h, confirm/cancel/reschedule by reply). Never first, never
without the paperwork.

## Cross-vertical rules

- Shared core changes (agent loop, RAG, channels) need a FULL
  re-run: every vertical's eval pack, not just the new one.
- No vertical inherits another's prompt section — copy, adapt,
  review. A ticketing rule leaking into medical advice is the
  nightmare scenario; packs are firewalled by construction.
- Pricing per vertical follows docs/pricing-worksheet.md separately
  (turn values differ wildly: a missed boat seat vs a missed resort
  night are different LTVs).

## Done when (per vertical)

Eval pack green, partner's first real transaction logged with
receipt, money path drilled (hold→pay→confirm→refund-story),
docs updated, no regression in any existing vertical.
