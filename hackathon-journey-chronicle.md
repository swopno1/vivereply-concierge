# The Vivereply Concierge Hackathon Journey — A Chronological Chronicle

*Meta Global AI Developer Hackathon · Startup track · Oct 26 – Nov 4, 2026*
*Written Oct 29, 2026 — the journey as it actually happened, including the wrong turns.*

---

## 0. Prologue — before the starting line (Oct 20–26)

Md Amir Hossain, a solo founder in Dhaka running ViveScript Solutions LLC, entered the Meta Global AI Developer Hackathon on the startup track with an AI front-of-house for resorts. The application was **approved on Oct 20**. He told his AI companion, Cosmo, that he was a first-time hackathon participant and "a little confused" — so the working arrangement became paired companionship: Cosmo holds the map, shrinks each day to one concrete target, and explains the build in plain, story-first language. (A Bangla explainer written as if for a 15-year-old landed with "Nice. I love it.")

The week before kickoff was preparation, not building: the $150 Meta Model API credit was approved and added (Oct 26), the API key was created and stored in his password manager (Oct 26, 21:32 — never in chat, never asked for again), the official rules arrived in hand (Oct 27, 00:51 — anti-projects, judging, prizes, the standalone-repo rule, the video's opening-line rule), and a build-in-public series was planned (a couple of posts a day: morning = today's target, evening = shipped-or-stuck, never an unearned win). Kickoff: **Monday Oct 26, 11:00 PM Dhaka.**

---

## 1. What we started with — the problem

Independent resorts and hotels — the kind with no 24-hour front desk — lose guest enquiries that arrive after hours. A traveller browsing at midnight finds no one to answer "is the sea-facing room free next weekend, and what does it cost?" and books elsewhere by morning.

Worse than silence is a wrong answer. An AI that invents a price, hallucinates availability, or confirms a room that doesn't exist creates overbooking and disputes — it destroys the trust a resort sells. So the problem had two halves: **the resort is unreachable at night, and any automated answer must be incapable of lying.**

What already existed: **Vivereply Suite**, a Resort Property Management System with a direct-booking website, and its demo site **demo1.vivereply.com** — "Krishnachura Retreat," a fictional resort in Himchari, Cox's Bazar, with real rooms, real rates, and a seeded year of bookings. What did not exist: a working chat product. (This last point became important — see §5.)

---

## 2. The vision — an AI front-of-house on live booking data

The vision, set at kickoff: **Vivereply Concierge** — an AI front-of-house for the resort, wired into the Suite's *live* booking data. One chat with two modes:

- **Answer mode** — grounded answers from the resort's own knowledge (check-in times, halal dining, packages), retrieved, never guessed.
- **Act mode** — real actions through tools: check live availability → give an exact quote → hold a booking draft with a code → hand off to staff when it can't help.

The founder's road, in his own order: (1) build the chatbot completely from zero in a new repo; (2) build the AI front-of-house; (3) build standard RAG for general queries — later, the real-time bot first; (4) build the widget to bridge demo or other websites; (5) wire it to Demo1. "Running properly" got a written acceptance checklist: chat loads on demo1 and holds a full conversation; seeded questions right in Bengali *and* English; availability → quote → draft end to end with quoted price = booked price; nothing invented; handoff delivers the full summary to staff; still works after a fresh redeploy.

The architecture was locked on Oct 27: Next.js + TypeScript, a **hand-rolled tool-use loop** (no agent framework), **separate databases by design** (Concierge's own Supabase project; the Suite's database never touched directly — joined over HTTP + IDs only), pgvector RAG at threshold 0.45, Muse Spark via the Meta Model API with native tool calling, hosted on **Vercel** (direct `api.meta.ai` calls — never through a gateway, never a non-Meta model host, to keep the Meta-tooling criterion clean).

---

## 3. The plan

Day-by-day: step 1 (chat) Oct 28; step 2 (agent tools) Oct 29–31; step 3 (RAG) Nov 1; step 4 (widget) Nov 2; step 5 (demo1 wiring) Nov 2–3; rehearsal Nov 3 evening; video + submission Nov 4 evening Dhaka (~12h buffer before the Nov 5, 8:00 AM Dhaka deadline). Scope-cut order, agreed in advance: multi-property → payment step → extra languages; never cut availability + quote + booking draft + handoff.

---

## 4. What we did — day by day

### Oct 26 → 27 — Day 1: smoke, repo, and the first correction

- **01:22** — Smoke test passed: Muse Spark 1.3 answered via `api.meta.ai`. Lesson learned immediately: 337 reasoning tokens were spent to say "Hello!" — the adapter must budget generously because reasoning counts against `max_tokens`.
- **01:30** — Public repo `swopno1/vivereply-concierge` created and verified; skeleton pushed (commit `a88a009`: "Start our real journey from here…").
- **~01:52** — The connector spike delivered its verdict: **Chat/RAG code existed in the old repo but was never deployed and never seeded — no guest-usable path existed.** The founder had been right that "Chat is not running"; the earlier assumption had mistaken code existence for a live product.
- **~01:08–02:00** — The correction reshaped scope: a *minimal* Chat+RAG (chat UI + retrieval over seeded demo knowledge) joined the hackathon scope so the demo would have a working surface; the full Chat product moved to a parallel post-Nov-4 track. Guardrail written down the same night: RAG is grounding, never the headline (a "basic RAG app" is on the hackathon's anti-list).
- **02:35–02:44** — Step 1 built and verified ("Hello Concierge": Next.js + chat page + Muse adapter), then confirmed working in the founder's browser and pushed. He chose the Supabase-first path for persistence.
- Alongside: the Day 1 declaration post + Letter-style poster drafted (he publishes himself), demo1's banner switched to a hackathon-demo declaration, and a deterministic year-round booking seed was written for demo1 (Jan–Aug light, Oct 25–31 full-pack — a seed choice that would come back to bite us).

### Oct 27 (evening) → 28 — Day 2: the security layer, the deploy, the widget

- **19:49** — Founder decision: a security layer must land *before* any deploy — login plus an admin page for approved domains, so random sites can't host the bot.
- **20:02–23:37** — Step 4.5 designed, built, and simulation-verified (11/11 auth tests): single admin via env password, HMAC-signed HttpOnly sessions, `ApprovedDomain` table, a widget token handshake (browser Origin checked, token required on every chat call, only the token's propertyId trusted, domain re-checked per message, cross-property conversation IDs ignored).
- **23:50** — **Concierge live on app.vivereply.com** (HTTP 200; widget.js serving the handshake version).
- **~00:03** — Step 5 landed via the founder's own commit on demo1: the Concierge widget embedded on demo1.vivereply.com, the old in-repo chatbot removed, the WhatsApp cluster moved bottom-right → bottom-left. His verdict: "Nice, everything works fine so far."
- A P2022 incident the same night (a migration marked applied without its column) was diagnosed and repaired with an `IF NOT EXISTS` repair migration — the kind of unglamorous work that keeps a demo alive.

### Oct 28 — Day 3: the catalogue, the blocker, and the reckoning

- **09:54** — The catalogue flip: the founder pasted 5 unlabeled Room UUIDs; applied in paste order to the 5 Krishnachura rooms (Terracotta Villa ৳14,500 … Earth Lodge ৳16,800). Commit `4d57715`. Mapping assumed from order, flagged for row-by-row verification.
- **10:12** — A live test caught a real gap: asked for a sea-facing room, the bot honestly said it had no verified view data. The fix (`highlights` from seed-verbatim amenities — only Terracotta has a sea view) shipped at 10:15, and the retest confirmed it. The bot asking for exact dates was correct behaviour, not a bug — availability needs dates.
- **~11:00** — **The blocker.** Probing demo1's availability endpoint directly: all 5 rooms returned `available: 0` on *every* window, including months with no seeded bookings. Root cause, verified in code: the seed's Oct 25–Nov 1 full-pack week left CHECKED_IN stays on every unit, and demo1's overstay guard excludes any unit holding *any* CHECKED_IN booking from *every* future window, undated, until checkout. **The bot's "fully booked" answers had been truthful** — the Suite itself returned 0. Quote → draft, the heart of demo scene 1, was impossible on live data. The fix (check out the 19 stays in demo1's new Supabase project; never re-seed before Nov 1) was specified the same day — and is still the open gate.
- **10:44–11:59** — Three decisions in one remarkable hour: the founder's notebook defined an **agentic sales-representative role** (split accepted: sales posture in the prompt if he supplies the bargain ladder — still awaited — with non-negotiable honesty guardrails: never invent discounts, availability, or scarcity); a ChatGPT plan he shared *as advice, not verdict* got an explicit adopt/reject review (adopted: hospitality-agent story, tenant-isolation demo beat, scope freeze; rejected: second demo, pre-submission multi-tenant rebuild, repo-as-SEO); and the **two-track decision**: freeze the demo for submission, build the product on `product/multi-tenant` merging only after winners (Nov 9).
- Also Oct 28: the judging weights were **corrected** (not "equally weighted" — Impact 30%, Meta AI tooling 25%, Demo 25%, Technical depth 20%, from two independent rule write-ups); the deadline conversion was corrected (Nov 4, 9 PM ET = Nov 5, **8:00 AM** Dhaka, not 7:00); the verification design was superseded by a **privacy-safe staged design** (code → dates + first name only; details emailed, never shown in chat); the /hackathon page went live; Day 3 posts were drafted framing the booking loop as the target, not a shipped win.

### Oct 28 (night) → 29 (dawn): the Concierge night build

One continuous session, roughly 22:00 → 06:45, took the Concierge from "demo path plus RAG code on branches" to "multi-tenant product, merged, live, and re-verified." The commits tell the pace: brand (`b324519`, 21:56) → bridge (`fc1a433`, 22:52) → settings (`b78d9df`, 23:20) → adapters (`8d007f7`, 23:58) → RAG (`59ace76`, 00:12) → worker rework (`85eca82`, 00:37) → tenant core (`afe0c50`, 01:59) → merges #6 (03:19) and #7 (03:41) → Auth Tier 1 (`7d7bfda`, 04:00) → Baseten fallback (`5741cf4`, 04:23) → merge #8 (04:31) → bootstrap email (`d13fba8`, 04:51) → merge #9 (04:55). Nine pull requests merged in one night, all by the founder's hand.

- **~00:00 — P0: the red that proved the gate.** A 7-point live sweep found production chat broken *by our own merge*: the adapter code queried new tables the production database didn't have yet. Demo1's Suite was probed directly and found healthy (Bamboo Dec 1–3 → 4 units) — our side, not Cosmo's. The founder ran `db push` from outside the sandbox; the re-sweep went 7/7 green and became the locked regression baseline (quote-only, no draft writes burned).
- **Two probe failures that were the probes' fault.** The sweep flaked twice on a year-less "Dec 1 to Dec 3" — the agent sometimes asks for the year. Verdict: pin 2026 in probes, log the wart (a front desk shouldn't ask) for Nov 2 polish. And a compile harness leaked two stray `.js` files into `lib/` — caught in the pre-commit status review, deleted, never committed. The discipline held: review the tree before every commit.
- **P1–P5: the tenant core.** Owner logins (scrypt) + seed-file registration (no public signup, by design); sessions carrying role + property with all ten admin APIs scoped; a labeled fixture backend (`FIX-` codes, shared rate math) with precedence fixture → binding → demo fallback → honest error; a staff iframe widget on 15-minute origin-bound tokens (bridge keys never reach browsers); Settings consolidated as the single config surface with Admin repurposed to super-only ops. Static proof: typecheck green, 68 probes.
- **Auth Tier 1 + Baseten.** Revocable server-side sessions, DB-backed login throttling, password change, super-admin registration UI — then the Baseten fallback: primary Meta API first, one retry against the pinned open-weights model, inert without the key. The model name is a pinned constant, not a variable — the key works with exactly one model, so configurability would be a pure footgun.
- **The seed handoff.** The founder ran `pnpm seed:tenants` on his own machine and hit the guard on the first try — password under 12 characters, refused cleanly, nothing half-written. Second run: both tenants seeded. The guardrail worked on its first real user.
- **P4 part 1, live.** Deploy fingerprinted 7/7 (new code serving), P0 regression 7/7 (Krishnachura untouched), throttle proven (5×401 → 429), Bengali total and private lookup re-confirmed. The Seabreeze property row resolved live. What stayed behind the credential wall (owner chats, widget round-trip, register loop) was queued as founder-assisted proofs.
- **~06:40 — the reel.** A live Krishnachura loop was driven and recorded: ৳17,000 quote → real draft **RES-202610-00004** (totals match, PENDING) → code-only lookup → Bengali ৳১৭,০০০. Then a 3-minute vertical demo video was rendered from the verbatim transcript — real words, real prices, real code — with voiceover and burned captions, guest contact masked for public posting. The video's visuals are a reconstruction, and the record says so.
- **One honest surprise.** The founder asked where "Seabreeze" came from — the test tenant's name had been the AI's invention, approved implicitly inside a larger plan. Lesson re-learned: names that stick need explicit consent. The tenant is invisible to guests and can be renamed or removed.

### Oct 29 — Day 4: hardening and the audit

- **04:55** — PRs #8/#9 merged to main (HEAD `f1ad3f1`): **Auth Tier 1** — Property + User models (SUPER_ADMIN vs single-property OWNER), a server-side Session allowlist (logout/password-change/admin-revoke actually kill sessions — correcting an earlier wrong note), idempotent tenant seeding, login throttling, plus the Baseten fallback (demo insurance: one retry against the pinned open-weights model, logged, README-disclosed).
- Morning — Community demo videos v1/v2/v3 delivered (3:00 narrated, 1:18 running-chat, 1:18 with voiceover briefing the night front office), built from genuine captures of the filmed strict 2-night session (Terracotta, Oct 29–31 → ৳29,000 quote → draft RES-202610-00003, code verification showing dates + first name only).
- **11:07–11:32** — An eleven-checklist audit series in a single side-chat session: codebase grade, product/UX, security & privacy, business impact & problem-solution fit, Meta AI integration & AI quality, demo quality & presentation, security & tenant isolation, UI/UX & accessibility, code quality & architecture, reliability/performance/resilience, testing & measurable evidence — each grounded in files actually read, each with an explicit rule: no invented numbers. It surfaced real findings: a double-draft race condition to verify, an unverified Meta call timeout, the RAG propertyId filter as the highest-risk untested boundary, and the session-revocation correction.

---

### Oct 29 (midday): the optimization pass

With the build phase effectively complete, attention turned to a thinking guide for Muse API usage — accuracy first, quality second, cost third — and the live code was audited against its seven dimensions. The audit paid off immediately:

- **A real bug.** The chat history cap (`take: 20`) ran oldest-first, silently dropping the *newest* context past 20 messages. Fixed to newest-first + reverse, with a comment confessing the original inversion. The guide's own "history unbounded" line was stale — corrected in the same pass.
- **Two cheap wins.** Trivial turns (greetings, thanks, acks — EN + BN) now skip the embedding call and the "Looking up…" phase entirely; and every model-call log row now carries which backend served it (`via: meta|baseten`), turning the fallback rate from a log-grep into a database query. No migration needed — the JSON column was already there.
- **What's still open.** The eval set (the referee for every future prompt change), the temperature experiment, the weekly metrics dashboard, and the per-property budget + cutoff before any paying tenant. Queued, not forgotten.

All three changes typechecked clean and shipped on a feature branch for the founder's review — small, demo-safe, and each one justified by the guide's own priority order.

### Oct 29 (afternoon): the eval set

The thinking guide's referee now exists as code: 12 cases across 8 categories (greeting, faq, quote, draft, verification, handoff, guardrails, i18n), all running against the in-memory fixture backend so no real Suite writes are possible. The runner logs in as the fixture owner, mints a direct token, and refuses unless the token's property is the fixture property — the wrong-backend run is structurally impossible, not just unlikely. Rates report per-category, never blended; the fixture-memory lookup caveat is a documented soft check, not a hidden flake.

The harness test (22 checks, no network, no secrets) caught one real bug before any live run: the check engine compared draft cards against a `total` field they don't carry — fixed to pin both total legs. A weekly dashboard script aggregates the logs we already keep; it deliberately does no cost math, because there are no verified per-token prices and an invented price would be worse than no number.

One step remains founder-side: the baseline run needs the fixture owner's password, which lives only in the founder's hands — one command, then the numbers land in the results log with the commit hash baked in.

The founder then asked for the exam behind a button instead of a terminal: a super-admin-only "Chatbot exam" card landed in Settings the same afternoon — one case per request (so no call outgrows the function timeout), full set via a loop with live progress, results copyable as JSON. The API route imports the same cases and checks as the terminal runner (no second referee to drift), mints the fixture token server-side so no password is needed, and refuses everyone but the super-admin. UI polish deferred by decision; the terminal stays as fallback.

The exam immediately earned its keep: experiment #5 (temperature 0.2, the guide's cheapest lever) started the same afternoon. The knob shipped as an optional env var — unset means byte-identical behavior — with the hypothesis and the adopt/revert rules written down in a new decision log *before* any run. Design: same commit, control run with the var unset, experiment run with it at 0.2, decided by the eval. Runs await the founder's deploy + clicks.

Item #6 (per-property budgets, cutoff, kill switch) was deliberately parked the same day: design written down in full (tokens-not-money until real prices exist, fail-open budget checks, fail-closed kill flag, owner-or-super-admin authority), reminders planted in the thinking guide and at the exact enforcement point in the chat route, build checklist queued for after Nov 9 — before the first paying tenant, not before the judges.

## 5. How the vision changed — and what changed it

- **"Chat exists" → "Chat was never live."** Evidence (the connector spike) beat assumption; scope grew by the honest minimum and the demo's opening line was corrected to match.
- **RAG: from feature to footing.** The anti-project list demoted retrieval from headline to grounding layer — which is also why the architecture keeps prices/availability out of knowledge docs entirely.
- **Who builds: Cosmo → Muse Code for Concierge.** The founder linked Concierge development to the hackathon's Meta-AI-tooling criterion; Cosmo kept demo1 and vivereply.com, with every demo1 change routed through him. (In practice both moved main forward; the freeze rule now guards it.)
- **One track → two tracks → merged anyway.** The Oct 28 freeze decision protected the demo from the product's ambition — but across Oct 28–29 the founder kept merging product PRs to main (#2 through #9: UI, brand, bridge, settings, adapters, RAG, tenants, auth). The freeze line evolved from "nothing merges" to "everything merges, the demo path stays green," guarded by the P0 regression sweep re-run after every phase.
- **Verification: convenience → privacy.** The staged design reveals dates + first name on a code lookup and emails the rest — built after asking what a *guest* would want kept out of a chat window.
- **Salesmanship: added, then leashed.** The founder wants an agent that sells, not just answers — accepted, with guardrails that outrank posture: honesty first, bargains only inside a founder-approved ladder, complaints and unknowns still go to staff.
- **The blocker that vindicated the bot.** The availability-0 incident could have been read as a Concierge failure; direct probing proved the bot told the truth and the bug lived in demo1's seed + overstay guard. The architecture's honesty rules survived their first real test.

---

## 6. What we made — for our domain, and for others

**The product.** Vivereply Concierge, live at app.vivereply.com and embedded on demo1.vivereply.com: a chat surface with streamed waiting states, Bengali/English switching, pgvector-grounded answers that say "I don't know" below threshold, and an agent loop with seven tools (availability, quote, booking draft, verification, lookup, send-details, handoff) guarded by quote-before-draft, one-draft-per-conversation, and Suite-total-governs. Around it: an iframe widget with approved-domain handshake and per-message re-checks, staff and admin views, Auth Tier 1 (roles, session allowlist, throttling, idempotent tenant seeding), and a tenant model designed for many resorts even though one is live.

**For our domain (hospitality).** A working proof that a front desk which *cannot lie* is buildable in days on live PMS data — and a set of patterns any hospitality builder can reuse: never invent (threshold fallback + handoff), quote from your own catalogue but let the booking system govern the total, verify bookings with codes not personal data, isolate tenants at the app layer, and treat the bot's refusals as the demo's best beats, not its embarrassments.

**For other builders.** A public standalone repo containing only hackathon-window work; an architecture of separate databases joined by HTTP + IDs; a hand-rolled agent loop small enough to read in one sitting; an apply-script workflow with byte-identical simulation that caught real bugs before delivery; and eleven audit checklists written against the actual code — including the corrections, which are kept in the record rather than edited out.

**Honest state of the build (Oct 29 midday).** Proven live: the chat, the tools, the guards, the widget, the auth, the filmed 2-night quote → draft → verification loop, the multi-tenant deploy (fingerprinted), the Krishnachura regression, login throttling, and the reel loop (draft RES-202610-00004). Pending: the availability fix on demo1's data (the open gate), the founder-assisted proofs (second-tenant chat, widget round-trip, register loop), the Modal worker's first live run, the Baseten fallback serve, and the submission video with its exact opening line — plus the pilot with real resorts, which is where impact stops being a story and starts being a measurement.

---

## 7. Epilogue — the road left

Oct 29–30: founder-assisted proofs (tenant-2 chat, widget, register loop), Modal worker live trial, demo1 availability gate. Nov 2: polish (licence, architecture doc, decision log, dependency pins, CI, eval set, secret scan, year-assumption prompt rule). Nov 3: record the 3-minute video — opening with the pre-existing-vs-built line, genuine footage only, no invented claims. Nov 4 evening: submit with a twelve-hour buffer, tag the commit, post the demo for the Most Viral track. Nov 5–8: judging, main frozen. Nov 9: winners — and the daily check-in cron comes down, as promised. After that: the product track (Supabase Auth migration, public signup decision, tenant-scope audit first).

*Whatever the judges decide, the journey record stands: what we planned, what broke, what we corrected, and what we refused to fake.*
