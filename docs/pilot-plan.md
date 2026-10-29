# Pilot plan: criteria, baseline, weekly review (draft for founder)

No pilot has run. Outreach starts only after the criteria below are
agreed — a pilot without a kill rule is a hobby. Targets marked
[FOUNDER] need a number before the first resort signs.

## Success criteria (per resort, first 30 days)

- Paid drafts from after-hours chats: >= [FOUNDER]/week (funnel:
  `pnpm funnel` — chats → quoted → drafted → pay-linked → paid).
- Helpful-vote rate: >= [FOUNDER]% yes (dashboard `helpful votes`).
- Zero trust incidents: no invented price/room/booking/payment URL
  reported by guest or staff (sampled transcripts + staff reports).
- Staff keeps the board open: >= [FOUNDER] handoffs triaged/week
  (a board nobody opens is a failed pilot even when guests are happy).

## Kill rule

Any trust incident the team cannot explain + fix within 48h pauses
that resort's pilot. Two pauses in one resort ends it. Write the
post-mortem in the evidence log before re-enabling.

## Baseline (capture at onboarding, not later from memory)

Ask each resort for the before-period (previous 30 days): missed
after-hours enquiry count (phone logs, Facebook/WhatsApp), and how
many became bookings. Store the answers in the evidence log next to
the resort's start date. Without this, "recovered enquiries" stays
unclaimable forever.

## Weekly review (30 min)

1. `pnpm eval:dashboard -- --days=7` + `pnpm funnel -- --days=7`:
   turns, tokens/turn, fallback rate, latency p50/p95, votes, funnel.
2. Read 5 sampled transcripts (2 drafts, 2 handoffs, 1 BN if any):
   mark invents, tone breaks, missed payments — file as tickets.
3. Check the kill rule. Say it out loud even when the answer is no.
