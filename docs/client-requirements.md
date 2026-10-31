# Client technical requirements (resort / Suite side)

Everything the CLIENT provides so Concierge works on their property,
and what Concierge guarantees back. Written for the resort's
webmaster and their booking-system owner — send this page, not the
repo. Owner-friendly version: docs/owner-guide.md.

## 1. Website (guest chat widget)

- Serve the site over **HTTPS** (guest chat over plain HTTP would
  travel unencrypted; Secure session cookies and Stripe pages
  require it anyway; localhost is dev-only).
- Paste the one script tag from Settings → Chat widget codes before
  `</body>` on every page where chat should appear. No build step,
  no npm, no framework requirement — plain script tag.
- Register each host in Settings → Domains FIRST
  (e.g. `www.yourresort.com` AND `yourresort.com` if both serve).
  Unlisted hosts get nothing — this is the anti-theft gate, not a
  bug. No DNS changes, no IP allowlisting needed.
- Keep the page's Content-Security-Policy (if any) permissive of
  the Concierge origin for scripts + frames + connects, or the
  panel can't load. Exact origin is on the snippet.
- Guest browsers: any modern Chrome/Safari/Firefox/Edge (last 2
  years). No app install, no account, no cookies required to chat.

## 2. Booking system / Suite backend (quotes, drafts, verification)

- Implement `docs/suite-api-spec.md` v1 (JSON over HTTPS): ping,
  availability, booking hold (POST, idempotent on
  `Idempotency-Key`), lookup-by-code, send-details-to-contact.
- Contract highlights the Suite owner must honor, not skim:
  24-hour auto-release on unpaid PENDING holds; 409 sold-out with a
  sold-out-shaped message; 429 as the rate-limit signal (status
  alone suffices); details ALWAYS go to the email on the booking,
  never to an address from the chat.
- Respond within 15 seconds (our timeout) and stay reachable —
  when the Suite is slow/down, guests get an honest error plus a
  staff handoff, but no quotes or drafts can complete.
- Auth: Bearer key if you want one (paste it in Settings → Booking
  system; encrypted at rest, never shown again). No key = open
  endpoints behind your own network controls — your call.

## 3. Secrets custody (who holds what — non-negotiable)

- Bridge keys (staff data access): live on YOUR server, in YOUR
  env/secrets manager. Never in page source, never in git, never in
  the browser. Leaked = revoke in Settings (instant) + mint again.
- Suite keys: pasted once into Settings, encrypted, never readable
  again — keep your own copy elsewhere; we can't show it back.
- Widget keys (`demo-*` labels) are PUBLIC identifiers, not
  secrets — the handshake (key + approved origin), not the key,
  decides. Don't bother hiding the snippet.

## 4. Staff side (two options, pick one)

- **Hosted**: use our /staff board in a browser. Nothing to
  install. Needs staff logins (we provision) + a modern browser.
- **Embedded**: your server mints 15-minute embed tokens with the
  bridge key and frames our staff widget (see
  docs/bridge-integration.md). Your server needs HTTPS + a secret
  store + the ability to make one outbound POST per page load.
  Either way: assign someone to handoffs — unanswered handoffs are
  an operations failure, not a software one.

## 5. Guest payments (your site collects, we point)

- Paste your own payment page URL in Settings → Booking system
  (e.g. `https://yourresort.com/pay`). After a draft, the chatbot
  sends guests there with `?booking=CODE` — your page should read
  the code and prefill it.
- Guests pay entirely on your website, by whatever means you offer.
  Concierge never takes resort money and can never confirm whether
  a guest paid — that is known only on your site.

## 6. What Concierge guarantees back

- Availability answers come from YOUR Suite or not at all — the bot
  never invents rooms, prices, or bookings (eval-enforced).
- Guest PII is minimized: lookups return first name + dates +
  status; details go to the booking email, never into chat.
- Your data stays yours: per-property isolation (probed), encrypted
  secrets, audit trail of admin actions, export + full delete on
  offboarding (docs/tenant-offboarding.md).
- Failure honesty: every dependency failure (model, Suite, DB)
  degrades to a plain message + staff handoff, never a silent lie
  or a fake confirmation. Current limits are stated in the README
  (no 2FA yet, no per-tenant spend quotas yet).

## 7. Pre-launch checklist (client + us, 30 min call)

- [ ] Domains registered + widget visible on the live site.
- [ ] Booking Test green in Settings; rooms listed with live prices.
- [ ] Test quote → draft → lookup round-trip on the live site.
- [ ] Staff can open the board (or embed) and resolve a test handoff.
- [ ] Guest payments: payment page URL saved; test draft links to your page with ?booking=CODE.
- [ ] Handoff rota named (who answers, within how many minutes).
