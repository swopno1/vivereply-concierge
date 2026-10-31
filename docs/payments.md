# Resort payments: the bot points, the resort collects

Positioning (founder decision 2026-10-31): resort GUEST money NEVER
touches our systems or our Stripe account. Booking payment always
happens on the resort owner's website. The chatbot "shows the cash
counter": after a draft, it deep-links the resort's OWN payment page
with the booking code — and can never say whether the guest paid.

(Our OWN subscription billing — resorts paying US — is a separate,
unbuilt system. Placeholder shape only: `lib/billing.ts`, commented
`BILLING_*` vars in `.env.example` §2. Nothing is wired.)

## Guest flow

1. Draft held → chatbot calls `get_resort_payment_link` in the same
   reply: the hold auto-releases after 24 hours unless the resort
   confirms it, so paying now on the resort page secures the room.
2. The tool returns `{ paymentUrl, bookingCode }` — server-built from
   the binding's `paymentPageUrl` + `?booking=CODE`. The reply and the
   Pay card repeat the URL verbatim (new tab, resort's site).
3. Guest pays entirely on the resort's website, by whatever means the
   resort offers. Concierge sees none of it.
4. "Is my payment done?" → the bot says it can't see resort-site
   payments, suggests checking the confirmation email/receipt, and
   offers a handoff. It NEVER confirms, denies, or guesses.

## Guard-rails (all enforced server-side)

- **No page, no pointer**: the tool + PAYMENT prompt section exist for
  a turn only when the binding has `paymentPageUrl` AND the backend is
  a real Suite (fixtures have no resort site). Otherwise the bot says
  to pay on the resort's website and offers a handoff.
- **Draft-first**: the tool errors without a held draft in THIS
  conversation — no draft, no pay link, ever.
- **Owner-configured URL only**: `paymentPageUrl` is set in Settings →
  Booking system, https-only in production (same rule as binding
  URLs). The code never invents a host, path, or parameter — only
  `?booking=` (or `&booking=`) is appended.
- **Repeat-verbatim**: prompt rule + card builder repeat the
  server-built URL exactly; the card builder refuses non-http(s) URLs.
- **No status anywhere**: no paid/pending tracking, no webhook, no
  receipt from us. The card carries booking code + URL only — a
  pointer, not a receipt.

## Setup (owner, 2 min)

1. Settings → Booking system → Edit → "Your payment page" →
   `https://yourresort.com/pay` → Save. (Empty = pointer off.)
2. Hold a test draft in chat; confirm the bot + Pay card link to your
   page with `?booking=CODE` appended.
3. Make sure your page reads the `booking` parameter and prefills it.

## What was removed (2026-10-31)

Our-Stripe guest checkout is gone from the codebase: `/pay/[token]`,
`/api/pay/*`, `/api/admin/payments/*`, the `PaymentLink` model, the
Settings Booking-payments room, `STRIPE_*`/`PAYMENTS_ENABLED`/
`MANUAL_*`/`PAYMENT_LINK_TTL_*` env, and the mint/status tools. The
replacement is strictly smaller: one config URL, one tool, one card.
`npx prisma db push` drops the `PaymentLink` table (export first if
any test rows matter — prod has none).
