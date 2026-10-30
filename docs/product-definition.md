# Vivereply Concierge — Product Definition (plain words)

Read this any time you forget what we're building. If this file and the app
disagree, the app wins and this file must be updated.

## Where this fits (the two faces — adopted 30 Oct 2026)

ViveReply is one business solution with two faces:

- ViveReply Suite — the complete package for a hotel/resort: the
  direct-booking website plus the property management side
  (bookings, front desk, inventory). Pre-existing; not hackathon
  work. (Suite-side detail per Cosmo; this repo holds the proof
  only for the chatbot half.)
- ViveReply Chatbot — the AI front-office assistant: answers guests,
  checks live availability, quotes exact prices, drafts bookings.
- Vivereply Concierge is the Chatbot's hackathon build name — the
  entry for the Meta Global AI Developer Hackathon (Startup track),
  built Oct 27–Nov 4 on the Suite's live booking data.

In judges-facing copy it is always a front-desk agent, never generic
agent infrastructure: native tool calling solving a domain-specific
problem in a closed setup (the resort's own front desk).

Last updated: 30 Oct 2026 (multi-tenant live, payments built flag-gated, submission evidence in progress).

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
2. Gives an EXACT quote (property catalogue prices × nights, e.g. ৳29,000
   for 2 nights). The quote is computed, never fetched — but the moment
   a draft is created, the Suite's OWN total governs: any seasonal rates
   or discounts in the client's backend flow through as live data, and a
   mismatch against the quote is surfaced, never hidden.
3. HOLDS a booking draft (a PENDING hold with a booking code like
   RES-202610-00002 — no payment, the resort confirms later).
4. VERIFIES bookings privately (by code it shows only dates + first name +
   status; by email/phone it never shows anything in chat, it emails the
   details to the address already on the booking).
5. HANDS OFF to a human the moment the request outgrows one room (a 25-person
   group, a special request) — the full chat goes to staff, who work it in
   our staff page, their own dashboard (server API), or our embeddable staff
   widget.
6. PRESSES FOR PAYMENT on held drafts (built, flag-gated, Suite-only):
   server-minted payment links (Stripe or manual transfer), insistence in
   the same reply as the draft, status re-checks. The bot never takes
   payment itself and never invents a payment URL.

It never invents a room, a price, availability, or a booking. If it doesn't
know, it says so and offers a human.

One product, many resorts: each resort (tenant) gets its own rooms, booking
backend, knowledge, reply voice, staff, and logins — and can never see
another resort's data. New resorts sign up publicly (email verification +
spam defense); the seed file survives for test tenants only.

## How one chat works (a real example)

Guest: "Is the Terracotta Villa available from November 10 to November 12?
What is the total for 2 nights?"

1. The website's chat box sends the message plus a signed permission slip
   (token) to our app. No slip, no answer. The slip — never the browser's
   word — says which resort this chat belongs to.
2. The app resolves the resort: its room list, its booking backend (real
   system, or the labeled test double for test properties), its knowledge,
   its reply voice. Krishnachura keeps its original wiring as the fallback,
   so the demo path is mechanically untouched.
3. The app saves the message and asks our AI (Muse Spark) what to do.
4. The AI doesn't guess — it calls tools, like a human clicking buttons:
   first "check availability", then "get quote". Each call hits the resort's
   booking backend over the internet and the result is logged.
5. The AI replies in words ("Total: ৳29,000") and the app shows a quote card
   built ONLY from what the tools returned — a card can never show a price
   the tools didn't say.
6. Guest confirms and shares name, email, phone → the AI calls "create draft"
   → the backend holds the room and returns a code → the guest gets a draft
   card, and the same code appears in the resort's own admin page.

While this runs, the guest sees honest status lines: "Thinking…" while the AI
reasons, "Checking… availability · Terracotta Villa · dates" while a real
check runs. Nothing is faked with timers.

## The parts

- Chat (the product). One shared chat screen used both on our app's homepage
  and inside the widget on the resort's site. Looks like ChatGPT: clean
  single column, guest messages in bubbles, answers as plain text, quote /
  draft / handoff cards, suggestion chips for first-timers, follow-up
  messages queue visibly instead of interrupting. Signed-in owners chat with
  their own resort here; signed-out visitors get the demo resort.
- Tenants (the multi-tenant core). Each resort is a Property row with its own
  owner login, widget key, domains, rooms, booking backend, knowledge, and
  staff scope. Sessions carry role + property; owners touch only their own
  property (cross-property reads answer 404); the founder's super-admin sees
  all. Registration is public signup (verified email required before any
  configuration); the seed file registers test tenants only.
- Agent + tools (the brain + hands). Muse Spark, via Meta's API, running a
  hand-rolled loop: think → call tools → think again, max 6 rounds. Tools:
  check_availability, get_quote, create_booking_draft, verify_booking,
  lookup_booking_by_code, request_booking_details, request_handoff, plus
  create_payment_link and check_payment_status when payments are on.
  Guards: quote before any draft, one draft per conversation (claim-
  serialized at the database, idempotent across retries), a returned
  booking code is CONFIRMED (later "0 available" is expected, not a bug).
- Suite backends (real + fixture). Any booking backend implementing
  docs/suite-api-spec.md plugs in via Settings (URL + encrypted key, room
  catalogue, Test connection, failure health). Test properties run on the
  labeled fixture backend (FIX- codes, deterministic, in-memory) — it never
  touches HTTP and is never mistaken for real. Precedence: fixture registry
  → binding row → demo fallback → honest error.
- Verification (the privacy design). By code: chat shows dates + first name +
  status and NOTHING else — the server strips the rest so the chat layer
  can't leak more. By email/phone: chat NEVER shows details and NEVER says
  whether a booking exists; details go only to the email stored on the
  booking. The reply is byte-identical for a real and a fake contact.
- Bengali (not a translation layer). The chat detects the guest's language
  from their letters (the ৳ sign alone never flips it) and answers in
  Bengali with Bengali totals, e.g. ৳17,000 for 2 Bamboo Cottage nights.
- Chat widget (the embed). One `<script>` tag the resort pastes on its site.
  Chat button + panel with the origin logo, short-lived token iff the site's
  domain is approved, chat in an iframe. Works for any seeded property's key.
- Staff page (/staff). Triage board for one property's handoffs: status
  filters with counts, compact list, one transcript at a time, notes,
  assignment, resolve/reopen. Owners see only theirs; verified email required.
- Staff bridge (server API). Client
  dashboards work handoffs from their own servers: list, read with
  transcript, assign, close, follow-up notes — all as JSON, guarded by
  per-property keys. Keys are hashed, revocable instantly, and never leave
  the server. See docs/bridge-integration.md.
- Staff widget (the embed). An iframe version of the staff loop for client
  dashboards: filter, transcript, notes, assign, close. The dashboard server
  mints a 15-minute origin-bound token per page load; the bridge key never
  reaches the browser. Strict origin binding, mutual exclusion with chat
  tokens, documented limits.
- Settings (/settings). The single configuration surface, one property at a
  time: chat widget codes, widget domains, staff bridge codes + widget
  snippets, bridge keys, Suite connections, room catalogues, Secrets (honest
  Later), live security board, role-aware profile, Appearance (honest Later).
  Super-admins additionally see Tenants (cross-property oversight: owners,
  suspend/resume) and Onboarding re-runs (approvals) at the top — there is
  no separate admin page.
- Onboarding + knowledge (RAG). One guided run per property fills its
  knowledge base: business form + reply identity, website (fixed knowledge
  endpoint or polite crawl), document uploads. Hard token budget, one run per
  client unless super-admin approves more (owners can never self-approve).
  Heavy lifting runs in a Modal Python worker that embeds and stores with
  guards; guests never see half-ingested runs. See docs/onboarding.md.
- Security. Owner passwords are scrypt-hashed (signup-chosen, or seeded
  test passwords committed as test credentials and rotated after prod
  seeding); login throttled with anti-enumeration timing; sessions are
  signed cookies carrying role + property (server rows, revocable);
  chat tokens carry the property ID (the browser's claim is ignored);
  widget domains re-checked on every message; bridge keys hashed +
  revocable; widget tokens short-lived + origin-bound; chat throttled
  per-property and per-IP (429 + Retry-After, fail-open with alarm);
  framing locked to same-origin except the two embed surfaces; every
  admin mutation lands in the audit log. Honest limits: no 2FA, no
  password reset-by-email, no per-tenant spend quotas yet.
- Knowledge answers (supporting only). Check-in 2 PM / check-out 11 AM,
  halal food, packages — answered from seeded notes via vector search, and
  only when the match is strong. Prices and availability NEVER come from
  these notes; the tools govern those.

## Current position (30 Oct 2026)

Everything ever branched is merged (PR #6 RAG onboarding, #7
tenant-core, #8 auth tier 1, plus signup, payments, triage, audit,
throttles, draft-claim, error boundaries). Live at app.vivereply.com
+ demo1.vivereply.com; 70 unit tests, 19 eval cases, 10 isolation
probes green in code (recorded runs still owed — see below). See
docs/STATUS.md for the snapshot and docs/evidence-log.md for the
journal.

Live proofs still owed (no claim without them): recorded eval + probes
runs with committed JSON, payments trial end to end, live fallback
serve, mobile device pass, clean-clone validation, uptime monitor.
The video is scripted, unfilmed. See docs/hackathon-final.md.

## What we have built so far (proven live, see docs/evidence-log.md)

- The app is live at app.vivereply.com; the widget is embedded on the demo
  resort site demo1.vivereply.com.
- P0 regression baseline green (7/7) after the prod database migration.
- Multi-night quote → draft → admin loop: real drafts with matching totals,
  PENDING in the resort's own admin (latest: RES-202610-00004, Bamboo).
- Bengali dated totals live (৳17,000 / ৳29,000 paths); Bengali sold-out
  path honest (no quote when full).
- Verification: code path shows only dates + first name + status; contact
  path gives identical generic replies and the real email arrived in inbox.
- Group handoff: 25-person request → handoff card → record + transcript
  in /staff triage board (filters, notes, assign, resolve).
- Widget path: handshake accepts approved domains, rejects bad keys and bad
  origins, widget-token chat quotes live prices.
- Owner signup: public registration with email verification + Turnstile;
  configuration locked until verified. Seed file kept for test tenants.
- Payments (built, trial-pending): insist-per-draft, server-minted /pay
  links (Stripe/manual), webhook + staff confirm, status re-check.
  Stripe over hand-rolled REST (no SDK): per-link idempotency keys on
  session create, HMAC-verified webhooks with timestamp tolerance.
- Client integration: staff bridge API (list/read/assign/close/notes,
  docs/bridge-integration.md); demo1's /admin/chatbot-admin works it
  natively (demo1-side, attested Oct 30).
- UI: ChatGPT-style chat in a left-nav shell (role-filtered, sign-in/out);
  both widgets branded; privacy notice + helpful-rating post-chat.
  (A conversation-history list is still post-hackathon work.)

## What we have NOT built (say it honestly)

- One live property today (Krishnachura Retreat, fictional demo) plus the
  Seabreeze fixture double. No real resort, no pilot customer yet.
- No recorded eval/probe/dashboard runs with committed JSON — the suites
  exist and pass in code; the judging evidence needs founder runs.
- No video filmed; no portal submission yet; no uptime monitor armed.
- No second demo, no revenue, no reviews, no seasonal rates (flat nightly
  prices). None are claimed anywhere.
- No 2FA, no password reset-by-email, no per-tenant spend quotas, no
  staff reply-into-chat, no notifications. Stated, not hidden.

## What's next

Nov 1 numbers (eval/probes/dashboard/fallback evidence), Nov 2 breakage
(drills + devices + go/no-go), Nov 3 footage, Nov 4 paper (tag + portal),
Nov 5–8 hands off, Nov 9 close. The day-by-day plan with gates is
docs/hackathon-final.md; rehearsal detail is docs/demo-test-plan.md.

## Cheat sheet

- Demo resort: Krishnachura Retreat, Himchari Hills, Cox's Bazar (fictional).
- Test resort: Seabreeze Test Inn (fixture backend, FIX- codes, Harbor Suite
  ৳12,500 · Dune Room ৳6,800).
- Rooms/night (Krishnachura): Terracotta Villa ৳14,500 · Bamboo Cottage ৳8,500 ·
  Clay House Suite ৳9,800 · Palm Loft ৳7,200 · Earth Lodge ৳16,800. Flat
  demo catalogue; client-side seasonal/discount logic governs draft totals live.
- Check-in 2:00 PM, check-out 11:00 AM.
- Live: app.vivereply.com (Concierge) · demo1.vivereply.com (resort + widget).
- AI: Muse Spark is the agent; Gemini is embeddings-only.
- Databases: Concierge DB and Suite DB are separate, joined by HTTP + IDs only.
- Tenants: public signup (verified email) or seed file for test tenants; owners log in with email + password.
