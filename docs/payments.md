# Booking payments (suite users, flag-gated OFF by default)

The chatbot insists on payment for every held draft but never takes payment
itself and never invents a payment URL: it repeats a server-minted deep link,
`/pay/[token]?booking=[code]`, that works standalone (no chat needed).

## Guest flow

1. Draft held → chatbot presents booking details AND presses for payment in
   the same reply (24h hold, auto-release unpaid).
2. Guest picks a method — card (Stripe) or manual transfer (bKash/bank,
   verified by staff). "What do you accept?" lists exactly the configured
   methods, never invented ones.
3. `create_payment_link` mints the row; the Pay card + the reply carry the
   URL verbatim (new tab). Fraud-safety lines ride along in chat, on the
   card, and on the page.
4. Guest pays: Stripe Checkout (card) or the manual instructions. Webhook
   (card) or staff confirm in Settings (manual) flips the row to paid and
   sends the receipt email.
5. "Is my payment done?" → `check_payment_status` reads the row: paid time
   and amount, or still pending with expiry + the URL again.

## Guard-rails (all enforced server-side)

- **Off by default**: `PAYMENTS_ENABLED=true` gates tools, prompt section,
  /pay page, checkout, webhook, and the Settings room.
- **Suite-only**: fixture properties never get payment tools or links, even
  with the flag on (`propertyTakesPayments` = flag + non-fixture).
- **Configured-domain links**: URLs build ONLY from `APP_BASE_URL` (required,
  https in production) — never Host headers. Minting also requires the
  property to have an active website domain in Settings.
- **Booking-bound links**: the code rides in the URL AND the page refuses any
  token whose code mismatches. All refusals share one generic face.
- **Server-side money**: amounts snapshot from the draft at mint; the browser
  sends only the token; Stripe sessions carry a per-link idempotency key.
- **Model-blind secrets**: tool outputs carry the full URL but never the raw
  token; the page shows first name only, never email/phone/full name; the
  receipt email carries no links at all (un-phishable template).
- **Cards can't be faked by hand**: only the verified Stripe webhook flips
  card rows; staff confirm manual rows only, after verifying the transfer.

## Setup

1. `prisma db push` (new `PaymentLink` table) + deploy.
2. Stripe test mode: restricted key (`rk_…`) → `STRIPE_SECRET_KEY`; register
   `https://app.vivereply.com/api/pay/webhook` for
   `checkout.session.completed` → `STRIPE_WEBHOOK_SECRET`; set
   `PAYMENTS_ENABLED=true` + `APP_BASE_URL`.
3. Trial on the demo property (it has an approved domain): hold a draft in
   chat, pick card, pay with `4242…`, confirm the paid card + email + the
   Settings row. Then a manual link → confirm in Settings.
4. Go live: live keys + live webhook, same steps.

## Deferred (deliberate)

- Per-property Stripe accounts (Connect) and per-property manual
  instructions — platform key + generic instructions for the MVP.
- Link sweeper — expiry is lazy (every read marks expired rows).
- Releasing the Suite-side hold on expiry — the Suite owns its hold clock;
  our 24h default mirrors it (tune via `PAYMENT_LINK_TTL_HOURS`).
