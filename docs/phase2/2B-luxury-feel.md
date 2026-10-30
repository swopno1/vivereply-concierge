# Phase 2B — Luxury feel for mid-level resorts (the pricing-power phase)

Parent: docs/phase2-roadmap.md. Goal: a mystery guest can't tell the
first 3 turns from a good human agent, and every failure ends in a
human. No vibes — each lever below is a shippable unit.

## B1. White-label Appearance room (code)

- The Settings Appearance room stops being a Later placeholder:
  per-property primary color, logo upload, assistant name + avatar,
  bubble style. Widget + /widget read the property's theme at load
  (cached, no per-turn cost).
- Guardrail: contrast floor (reject unreadable pairs with a plain
  message, don't silently ship gray-on-white).
- Check: two properties, two themes, same build; axe contrast pass
  on both.

## B2. Proactive engine (code + templates)

- Event sources: Suite booking events (confirm/cancel webhooks where
  the Suite offers them, else a nightly Modal poll of recent drafts)
  + payment rows + dates (3-day pre-arrival, checkout day).
- `ProactiveSend` table (propertyId, guest ref, template, scheduled
  for, sent at, status) + worker dispatch; every send logged and
  STOP-aware (A4 blocklist applies).
- First four automations: booking confirmed, payment receipt,
  pre-arrival upsell (room upgrade? airport pickup?), checkout
  thanks + review ask.
- Check: date-driven sends fire within 1h of schedule; no send to
  STOP numbers, ever (drill it).

## B3. Personalization (code + schema)

- `GuestProfile` (propertyId, phone/linked id, name, preferences
  JSON, last stay): "the quiet room you liked last time" beats any
  prompt trick. Written from stays + explicit asks, never inferred
  silently (say "I'll remember you prefer quiet rooms" out loud).
- Persona upgrade: per-property tone already exists — add 3 curated
  voice presets (warm-formal, crisp, playful) owners pick instead
  of writing prose.
- Check: returning guest greeted by name with prior context on web
  AND WhatsApp.

## B4. Service recovery (code + prompt)

- Detectors (cheap, deterministic): same question twice, complaint
  lexicon (small per-language list), 2 tool errors in one turn,
  guest says "human/agent/call".
- Action: priority handoff (flagged row, staff notified immediately
  via A6 channel) + guest told plainly "I'm bringing in [Name] from
  our team now" — never a silent queue.
- Check: scripted angry-guest eval case (new, in eval pack) routes
  to priority handoff within one turn.

## B5. Languages +Hindi, Arabic, Chinese (corpus + review)

- Pipeline per language: prompt rules block (mirror PAYMENT_EN/BN
  pattern), eval parity pair (quote-exact twin), NATIVE-speaker
  review of 10 turns before launch. Machine-only review ships
  embarrassment in luxury.
- Order: Hindi → Arabic → Chinese (corridor demand).
- Check: parity pairs green + signed native review note in log.

## Done when

Mystery-guest script passes (3-turn indistinguishability, judged by
a human, not a regex); failed-turn→human drill green; themed widget
screenshot pair in the evidence log.
