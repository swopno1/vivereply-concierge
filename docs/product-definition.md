# Vivereply Concierge — Product Definition (plain words)

Read this any time you forget what we're building. If this file and the app
disagree, the app wins and this file must be updated.

Last updated: 28 Oct 2026 (multi-tenant core built, live proofs pending).

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
   group, a special request) — the full chat goes to staff, who work it in
   our staff page, their own dashboard (server API), or our embeddable staff
   widget.

It never invents a room, a price, availability, or a booking. If it doesn't
know, it says so and offers a human.

One product, many resorts: each resort (tenant) gets its own rooms, booking
backend, knowledge, reply voice, staff, and logins — and can never see
another resort's data. New resorts are registered by the Vivereply team (seed
file); there is deliberately no public signup.

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
  all. Registration is the seed file only — no signup route exists.
- Agent + tools (the brain + hands). Muse Spark, via Meta's API, running a
  hand-rolled loop: think → call tools → think again, max 6 rounds. Tools:
  check_availability, get_quote, create_booking_draft, request_handoff,
  lookup_booking_by_code, request_booking_details, verify_booking.
  Guards: quote before any draft, one draft per conversation, a returned
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
- Security. Owner passwords are scrypt-hashed (seeded, env-supplied, never
  in the repo); sessions are signed cookies carrying role + property; chat
  tokens carry the property ID (the browser's claim is ignored); widget
  domains re-checked on every message; bridge keys hashed + revocable;
  widget tokens short-lived + origin-bound. Honest limits: no 2FA, no rate
  limiting, no public signup (by design).
- Knowledge answers (supporting only). Check-in 2 PM / check-out 11 AM,
  halal food, packages — answered from seeded notes via vector search, and
  only when the match is strong. Prices and availability NEVER come from
  these notes; the tools govern those.

## Current position (28 Oct 2026)

Live on main today: the Krishnachura demo path, re-verified end to end after
the database migration (7/7 sweep: home, bridge 401, settings gate, widget
accept/reject, ৳17,000 quote card, demo1 widget tag; plus Bengali dated
total and private lookup). See docs/evidence-log.md.

Built on branches, statically proven, awaiting merge + deploy + live proof:

- PR #6 (RAG onboarding + worker rework): guided runs, budgets, Modal
  worker owning embed + store, SSRF guards, indexed staging, least-privilege
  DB role. Merge FIRST.
- feature/tenant-core `afe0c50` (multi-tenant core P1–P5): owner login +
  seed registration, fixture backend + threading, staff iframe widget,
  consolidated Settings + ops Admin + grouped nav + full branding. tsc
  green, 68/68 probes. Merge SECOND, after #6.

Live proofs still owed (no claim without them): owner login + seed run,
seabreeze chat quote/draft/lookup, both-direction tenant isolation, staff
widget mint → iframe → note/assign/close round-trip, consolidated pages
rendering, Modal worker live trial, full Krishnachura regression.

## What we have built so far (proven live, see docs/evidence-log.md)

- The app is live at app.vivereply.com; the widget is embedded on the demo
  resort site demo1.vivereply.com.
- P0 regression baseline green (7/7) after the prod database migration.
- Multi-night quote → draft → admin loop: real draft RES-202610-00002
  (Terracotta, Oct 29–31, ৳29,000, totals match, PENDING in the resort's own admin).
- Bengali dated totals: Bamboo Nov 4–6 → ৳17,000; Terracotta Oct 31–Nov 2 →
  ৳29,000. Bengali sold-out path also honest (no quote when full).
- Verification: code path shows only dates + first name + status; contact
  path gives identical generic replies and the real email arrived in inbox.
- Group handoff: 25-person request → handoff card → record + transcript
  in /staff.
- Widget path: handshake accepts approved domains, rejects bad keys and bad
  origins, widget-token chat quotes live prices.
- UI: ChatGPT-style chat in a left-nav shell (Talk / Manage / Configure
  groups, role-filtered, sign-in/out at the bottom); both widgets bare and
  branded; origin logo everywhere. (A conversation-history list is still
  post-hackathon work.)

## What we have NOT built (say it honestly)

- One live property today (Krishnachura Retreat, fictional demo). The second
  property (Seabreeze Test Inn, fixture backend) is built and seeded but not
  yet live-proven — until P4 passes, "multi-tenant" is code, not a claim.
- No public signup — by design, not by omission. Registration is the founder
  running the seed file. No self-serve setup, no invite system yet.
- No second demo, no real customers, no revenue, no reviews, no seasonal
  rates (flat nightly prices), no accuracy figures. None are claimed anywhere.
- No 2FA, no rate limiting, no frame-ancestors allowlist on the staff widget
  (token + origin binding is the gate). Stated, not hidden.

## What's next

1. Merge + migrate + seed + deploy (founder): PR #6, then tenant-core PR;
   `db push` for Property/User; fill owner emails and run the seed; deploy.
2. P4 live proofs: tenant-2 end to end (chat quote/draft/lookup, RAG trial,
   staff widget round-trip), both-direction isolation, full Krishnachura
   regression. Every claim gets its evidence-log line.
3. P6 submission: demo script with the tenant-2 beat, filmed rehearsal,
   README/architecture refresh, submission packaging. Founder files the
   evening of Nov 4 Dhaka time.

## Cheat sheet

- Demo resort: Krishnachura Retreat, Himchari Hills, Cox's Bazar (fictional).
- Test resort: Seabreeze Test Inn (fixture backend, FIX- codes, Harbor Suite
  ৳12,500 · Dune Room ৳6,800).
- Rooms/night (Krishnachura): Terracotta Villa ৳14,500 · Bamboo Cottage ৳8,500 ·
  Clay House Suite ৳9,800 · Palm Loft ৳7,200 · Earth Lodge ৳16,800. Flat rates.
- Check-in 2:00 PM, check-out 11:00 AM.
- Live: app.vivereply.com (Concierge) · demo1.vivereply.com (resort + widget).
- AI: Muse Spark is the agent; Gemini is embeddings-only.
- Databases: Concierge DB and Suite DB are separate, joined by HTTP + IDs only.
- Tenants: seed file registers, owners log in with email + password, no signup.
