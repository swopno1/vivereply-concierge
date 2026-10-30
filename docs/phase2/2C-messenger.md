# Phase 2C — Messenger (the cheap-after-WA phase)

Parent: docs/phase2-roadmap.md. Deliberately small: if 2A was built
right, this is an adapter plus Meta paperwork, not a project. If it
starts growing new abstractions, 2A was built wrong — fix 2A instead.

## C1. Meta paperwork (founder)

- Same Meta app as 2A: add Messenger Platform, install on the
  resort's Facebook Page (per-property Page mapping lives next to
  the property record, owner-pasted + verified).
- Advanced Access + App Review for production senders (start with
  2A's review where possible — one review covering both products
  beats two sequential ones).
- Check: test Page sends/receives in dev; review submitted.

## C2. Adapter (code)

- `lib/channels/messenger/`: webhook verify (GET handshake) +
  signature check + normalize (PSID sender, text/attachments/
  postbacks → internal turns) + render (mirror the WhatsApp
  renderer — same short-text + button/list vocabulary).
- Identity: PSID → `ChannelIdentity` (same table as A4, new channel
  value). PSIDs are Page-scoped — the same human on two resort
  Pages is two identities by design (never merge across Pages).
- Reuse, don't rebuild: async pipeline (A3), idempotency
  (message-ID dedupe), opt-out handling, staff inbox (A6),
  quota counting (A5) — all channel-agnostic already.
- Check: unit tests mirroring the WhatsApp adapter fixtures.

## C3. Policy specifics (copy + config)

- 24h messaging window + approved tags outside it (the Messenger
  analogue of WA templates — confirm current tag list at build
  time, Meta renames these).
- No reply-then-spam: staff reply-into-chat obeys the same window.
- Check: outside-window send attempts fail closed with a logged
  reason, never a silent drop.

## Done when

Same E2E as 2A (quote→draft→pay-link) completes on a test Page;
full suite re-run green; no new abstraction introduced (diff
review: adapter + config + tests only).
