# Vivereply Concierge — Product Definition (plain words)

Read this any time you forget what we're building. If this file and the app
disagree, the app wins and this file must be updated.

## The idea in one sentence

A resort's website should answer, quote, hold, and hand off like a good
front-desk human — in the guest's language, from live booking data, with a
real human one step away.

## The problem

Today a resort website is a brochure: pretty pictures, a phone number, and a
"contact us" form. A guest asking "is the sea-view room free next weekend,
and what does 2 nights cost?" gets silence. The booking either never happens
or needs a phone call during office hours. Small resorts lose guests they
never meet.

## What we're building

An AI front-of-house that lives on the resort's website as a chat box. A guest
types in English or Bengali. The Concierge:

1. Checks REAL availability (how many units are free, from the booking system).
2. Gives an EXACT quote (real nightly prices × nights, e.g. ৳29,000 for 2 nights).
3. HOLDS a booking draft (a PENDING hold with a booking code like
   RES-202610-00002 — no payment, the resort confirms later).
4. VERIFIES bookings privately (by code it shows only dates + first name +
   status; by email/phone it never shows anything in chat, it emails the
   details to the address already on the booking).
5. HANDS OFF to a human the moment the request outgrows one room (a 25-person
   group, a special request) — the full chat goes to the staff page.

It never invents a room, a price, availability, or a booking. If it doesn't
know, it says so and offers a human.

## How one chat works (a real example)

Guest: "Is the Terracotta Villa available from November 10 to November 12?
What is the total for 2 nights?"

1. The website's chat box sends the message plus a signed permission slip
   (token) to our app. No slip, no answer.
2. The app saves the message and asks our AI (Muse Spark) what to do.
3. The AI doesn't guess — it calls tools, like a human clicking buttons:
   first "check availability", then "get quote". Each call hits the resort's
   real booking system over the internet and the result is logged.
4. The AI replies in words ("Total: ৳29,000") and the app shows a quote card
   built ONLY from what the tools returned — a card can never show a price
   the tools didn't say.
5. Guest confirms and shares name, email, phone → the AI calls "create draft"
   → the booking system holds the room and returns a code → the guest gets a
   draft card, and the same code appears in the resort's own admin page.

While this runs, the guest sees honest status lines: "Thinking…" while the AI
reasons, "Checking… availability · Terracotta Villa · dates" while a real
check runs. Nothing is faked with timers.

## The parts

- Chat (the product). One shared chat screen used both on our app's homepage
  and inside the widget on the resort's site. Looks like ChatGPT: clean
  single column, guest messages in bubbles, answers as plain text, quote /
  draft / handoff cards, suggestion chips for first-timers, follow-up
  messages queue visibly instead of interrupting.
- Agent + tools (the brain + hands). Muse Spark, via Meta's API, running a
  hand-rolled loop: think → call tools → think again, max 6 rounds. Tools:
  check_availability, get_quote, create_booking_draft, request_handoff,
  lookup_booking_by_code, request_booking_details, verify_booking.
  Guards: quote before any draft, one draft per conversation, a returned
  booking code is CONFIRMED (later "0 available" is expected, not a bug).
- Verification (the privacy design). By code: chat shows dates + first name +
  status and NOTHING else — the server strips the rest so the chat layer
  can't leak more. By email/phone: chat NEVER shows details and NEVER says
  whether a booking exists; details go only to the email stored on the
  booking. The reply is byte-identical for a real and a fake contact.
- Bengali (not a translation layer). The chat detects the guest's language
  from their letters (the ৳ sign alone never flips it) and answers in
  Bengali with Bengali totals, e.g. ৳17,000 for 2 Bamboo Cottage nights.
- Widget (the embed). One `<script>` tag the resort pastes on its site. It
  adds a Chat button + panel, asks our app for a short-lived token (only if
  the site's domain is approved), and the chat runs in an iframe.
- Staff page (/staff). Every handoff, newest first, with reason, summary,
  and the full transcript. Behind the admin login.
- Admin page (/admin). The approved-domains list: which websites may embed
  the widget. Deactivating a domain stops its widget on the next message.
  It also mints the bridge tokens below.
- Settings (/settings). Admin-only
  configuration rooms: copy-paste chat widget codes per key, staff bridge
  server snippets, a live security status board, and the admin profile.
  Secrets and appearance are honest Later placeholders for now.
- Suite adapter (built, going live with the next deploy). Any booking backend
  implementing docs/suite-api-spec.md plugs in via Settings: one binding
  (URL + encrypted key) and one room catalogue per property, with Test
  connection and failure health. demo1 keeps working through the same path.
- Staff bridge (server API). Client
  dashboards work handoffs from their own servers: list, read with
  transcript, assign, close, follow-up notes — all as JSON, guarded by
  per-property keys. Keys are hashed, revocable instantly, and never leave
  the server. See docs/bridge-integration.md.
- Security. Single admin password (env-held), signed login cookie, per-chat
  signed tokens that carry the property ID (the browser's claim is ignored),
  domain re-checked on every message. Honest limits: one admin, no 2FA, no
  rate limiting.
- Knowledge answers (supporting only). Check-in 2 PM / check-out 11 AM,
  halal food, packages — answered from 5 seeded notes via vector search, and
  only when the match is strong. Prices and availability NEVER come from
  these notes; the tools govern those.

## What we have built so far (all proven live, see docs/evidence-log.md)

- The app is live at app.vivereply.com; the widget is embedded on the demo
  resort site demo1.vivereply.com.
- Multi-night quote → draft → admin loop: real draft RES-202610-00002
  (Terracotta, Oct 29–31, ৳29,000, totals match, PENDING in /admin).
- Bengali dated totals: Bamboo Nov 4–6 → ৳17,000; Terracotta Oct 31–Nov 2 →
  ৳29,000. Bengali sold-out path also honest (no quote when full).
- Verification: code path shows only dates + first name + status; contact
  path gives identical generic replies and the real email arrived in inbox.
- Group handoff: 25-person request → handoff card → record + transcript
  in /staff.
- Widget path: handshake accepts approved domains, rejects bad keys and bad
  origins, widget-token chat quotes live prices.
- UI: modern ChatGPT-style chat — one shared shell puts the left nav sidebar on
  every web-app page (New chat, Chat / Staff / Admin links, sign-in or Admin +
  sign-out at the bottom); the widget stays a bare single column. No new
  libraries. (Nav links only; a conversation-history list is still
  post-hackathon work.)

## What we have NOT built (say it honestly)

- One live property only (Krishnachura Retreat, fictional demo). The code has
  property-ID seams, but the chat does not switch catalogue or booking system
  per property yet — that rebuild is scheduled AFTER the winners (Nov 9).
- No second demo, no real customers, no revenue, no reviews, no seasonal
  rates (flat nightly prices), no accuracy figures. None are claimed anywhere.
- No login/logout pages for staff beyond the one admin password, no settings,
  no self-serve setup, no invite system. Those are post-hackathon product work.

## What's next

1. Film the demo video from docs/demo-script.md (live product on camera, no
   slides substituting for the loop, fallback lines ready).
2. Package the submission (repo extract = only Oct 26–Nov 4 work, video,
   portal text). The founder files it; evening of Nov 4 Dhaka time.
3. After Nov 9: product track — login/logout, settings, chatbot-guided
   knowledge setup, sidebar chat, multi-property routing, invite-only beta.

## Cheat sheet

- Demo resort: Krishnachura Retreat, Himchari Hills, Cox's Bazar (fictional).
- Rooms/night: Terracotta Villa ৳14,500 · Bamboo Cottage ৳8,500 · Clay House
  Suite ৳9,800 · Palm Loft ৳7,200 · Earth Lodge ৳16,800. Flat rates.
- Check-in 2:00 PM, check-out 11:00 AM.
- Live: app.vivereply.com (Concierge) · demo1.vivereply.com (resort + widget).
- AI: Muse Spark is the agent; Gemini is embeddings-only for the 5 notes.
- Databases: Concierge DB and Suite DB are separate, joined by HTTP + IDs only.
