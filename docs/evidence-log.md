# Evidence log — Vivereply Concierge video/README claims

Rule: every "passed" claim names the live check behind it. No evidence, no claim.
Started 2026-10-28 (Day 3). Uncommitted working file; folds into Nov 2 polish.

## 2026-10-28 — live-state verification (Muse Code, curl probes)

- PASS app.vivereply.com / → 200. Widget embed confirmed on demo1 homepage HTML:
  `<script src="https://app.vivereply.com/widget.js" data-key="demo-krishnachura"></script>`
- PASS app.vivereply.com/widget.js → 200, 3759 bytes.
- PASS app /api/chat without token → 403 `{"error":"Chat token expired or invalid. Please reload the page."}`
  (matches main branch `app/api/chat/route.ts` — live app tracks main's auth layer).
- PASS app /staff (no cookie) → 307 to /login?next=/staff.
- PASS demo1 lookup live: GET /api/bookings/lookup?code=RES-202610-00001 → 200
  `{"bookingCode":"RES-202610-00001","firstName":"Arisha","checkInDate":"2026-10-28","checkOutDate":"2026-10-29","status":"PENDING"}`
  Corroborates handoff: draft is REAL, Terracotta, Oct 28–29, guest Arisha.
- PASS demo1 send-details live: POST /api/bookings/send-details {bogus email} → 200 generic
  `{"sent":true,"message":"If a booking exists for that contact, its details have been sent..."}`.
- PASS Terracotta Oct 28–29 availability = 0 — consistent with held draft consuming the unit
  (retraction-guard story holds: later 0 is expected, not invalidation).
- OPEN contract drift: lookup returns `checkInDate`/`checkOutDate`; Concierge main
  (`lib/tools.ts` lookup_booking_by_code) reads `checkIn`/`checkOut` → code path would
  return undefined dates. Fix side TBD by founder (my-side mapping vs Cosmo alias).
- OPEN availability anomaly, narrowed: Terracotta reads available=1 on ALL probed dates
  (Oct 29–31, Oct 30–Nov 1, Oct 31–Nov 2, Nov 1, 10–12, 15, 20–22, 27–29);
  Bamboo/Clay/Palm/Earth read 0 on every probe (Bamboo: 11 ranges Oct 28–Dec 20, all 0).
  Room IDs all valid (random UUID → 404 not_found, so 200/0 means real room, no free unit).
  Needs Cosmo-side /admin + Room/Unit inspection via founder relay.
- OPEN dated Bengali proof blocked: no Bamboo 2-night window with availability found yet.
- READY strict 2-night candidates (Terracotta, available=1): Oct 29–31, Oct 30–Nov 1, Oct 31–Nov 2.
  Draft creation NOT run (consumes the single unit — founder runs or authorizes first).
- OPEN WhatsApp button still on demo1 homepage ("WhatsApp Concierge" adjacent to widget
  script tag). Removal-vs-reposition decision needed before filming (Cosmo side).
- NOTE README.md line 30 ("no login protects /staff") is stale vs step 4.5 reality;
  queued for Nov 2 polish, untouched per freeze.
- NOTE demo-config/rooms.krishnachura.ts dormant file header ("DO NOT import... live DB
  still holds generic rooms") is stale post-flip; queued for Nov 2 polish.
- NOT independently verified (needs browser/authed session): chat waiting-states UX,
  end-to-end quote→draft in live chat, /staff handoff record, /admin draft row,
  real-email send-details delivery. Founder-reported or founder-to-run.

## 2026-10-28 — live end-to-end drive (Muse Code, direct-token chat via /api/chat SSE)

- PASS multi-night quote→draft, conversation cmvs2gjtm000008i7r5hy4uvd:
  Terracotta Villa 2026-10-29→2026-10-31 → quote ৳29,000 (2 × ৳14,500, card) →
  confirm + details → draft RES-202610-00002, suiteTotal = quotedTotal = ৳29,000,
  totalsMatch true, draft card. Guest: Amir Hossain / amirhossain.limon@gmail.com /
  +8801700000000 (test number). Real SSE phases observed (thinking/checking + detail).
- PASS independent draft check: demo1 lookup RES-202610-00002 → Amir, Oct 29–31,
  PENDING; Terracotta Oct 29–31 availability now 0 (unit consumed).
- RECORDED pre-fix code-path failure (conv cmvs2j3w6000a08l2ef5rut48): lookup ran,
  returned first name + status, reply said "The lookup didn't return stay dates" —
  the checkInDate/checkOutDate drift, live. Fix on branch fix/lookup-date-fields,
  function verified against live demo1 (node probe PASS). Re-run post-deploy pending.
- PASS contact path, real email (conv cmvs2jo61000h08l29tgfqlo2): generic reply,
  no details, no found-signal. Email delivery to inbox: founder to confirm.
- PASS contact path, bogus email (conv cmvs2k8ep000o08l2foc8nlf9): reply
  BYTE-IDENTICAL to real-email reply. Privacy property holds.
- PASS Bengali dated multi-night quote (conv cmvs2m7g2001208l2th583s7g):
  Terracotta Oct 31–Nov 2 → Bengali reply, ৳২৯,০০০ (৳১৪,৫০০ × ২), quote card.
  (Pinned Bamboo ৳17,000 still blocked: Bamboo 0 on all 11 ranges probed.)
- NOTED Bengali sold-out path correct (conv cmvs2kqql000v08l2hnnpvh28): Terracotta
  Oct 30–Nov 1 (overlaps held draft) → honest Bengali sold-out + alternatives, no quote.
- NOTED Terracotta Oct 28–31 now fully held (2 real drafts). Filming windows must use
  November dates (Terracotta Nov reads 1) or post-expiry units.

## 2026-10-28 — fix committed, email retest, /admin confirmed

- COMMIT fix/lookup-date-fields@af464e9 pushed (5 +/1 -, lib/suite.ts only). tsc clean,
  live function probe PASS. Awaiting founder merge + Vercel redeploy; code-path chat
  re-run pending after that.
- PASS /admin loop closed (founder-confirmed): RES-202610-00002 shows in demo1 /admin.
- OPEN email delivery, attempt 1 FAILED (routing not configured on demo1 side, founder
  fixed). Attempt 2 sent via chat conv cmvs3rl47000008kug2ukuxcc, same generic reply.

## 2026-10-28 — fix merged + deployed, code path passes, email attempt 3

- MERGED main@da084fa (PR #1, fix/lookup-date-fields). Vercel redeploy confirmed
  implicitly: code-path chat now returns dates (old code could not).
- PASS code path post-fix (conv cmvs51jxn000708jvwnm7exq0): RES-202610-00002 →
  first name Amir + check-in 2026-10-29 + check-out 2026-10-31 + PENDING, nothing else.
  Minimal-disclosure property holds end to end.
- OPEN email delivery, attempt 2 FAILED (demo1 config issue, founder fixed). Attempt 3
  sent via chat conv cmvs50qm2000008jvbk5jyhz6, same generic reply.
- PASS email delivery attempt 3 (founder-confirmed): details mail arrived in inbox.
  Verification story fully closed: code → minimal reply; contact → generic reply +
  emailed details; real vs bogus replies byte-identical.
- RELAYED to Cosmo (founder-confirmed): WhatsApp-button full removal + availability
  investigation. No Concierge-side action until founder confirms live.

## 2026-10-28 — Cosmo changes re-verified live, Bamboo proof, widget path

- PASS WhatsApp removal re-verified: "WhatsApp Concierge" button text 0 occurrences in
  demo1 homepage HTML; sole remaining "whatsapp" ref is a config data-field, not a button.
  Widget embed still present (2 refs).
- PASS availability anomaly resolved: Bamboo Nov 4–6: 1, Nov 12–14: 1, Nov 18–20: 0,
  Dec 1–3: 4; Clay/Palm Nov 4–6: 1, Earth: 0. Realistic variance, seed fixed.
- PASS pinned Bamboo proof (conv cmvs5rlp7000008l5bc6zr1rb): Bengali message, Bamboo
  Cottage Nov 4–6 → ৳17,000 (2 × ৳8,500) + quote card. Quote only, no unit consumed.
- PASS widget path end to end: /api/widget-token accepts demo1 Origin (widget-scoped
  token), rejects bad key ("Unknown widget key.") and bad origin ("not approved");
  widget-token chat turn → Palm Loft Nov 4–6 quote ৳14,400 + card (conv cmvs5sn3y000908l5u16tbp18).
- NOTE earlier 403 on a fresh direct token was my transcription slip, not an app fault;
  programmatic extraction worked first try.

## 2026-10-28 — staff bridge built (server-to-server JSON API, uncommitted)

- BUILT lib/bridge.ts (mint/parse/hash/verify, `cb.<prefix>.<secret>`, sha256,
  timing-safe), GET/PATCH /api/bridge/handoffs[/:id], POST notes, admin mint/revoke
  API + UI, schema (BridgeToken, HandoffNote, assignee), docs/bridge-integration.md.
- PROBE 16/16 PASS on real lib/bridge.ts (mint shape, 200-mint round-trip,
  tamper/garbage/scheme rejects, Bearer parsing, status allowlist). The probe
  caught a REAL delimiter bug (base64url `_` vs `_` separator) — fixed to dots,
  mass round-trip proves it.
- TSC green. No committed test (repo has no harness; style precedent kept).
- BLOCKED schema push: P1001 from sandbox (raw Postgres TCP cannot traverse the
  HTTP-only proxy; not a credential fault). Founder must run
  `pnpm exec prisma db push` outside the sandbox before deploy.
- PENDING live HTTP tests post-deploy: founder mints token in /admin and runs the
  doc's curls (secret must not travel over chat); I run unauth/bad-key 401 probes.

## 2026-10-28 — PR #4 merged, deploy state checked, chat smoke passed

- LIVE UI + branding: homepage carries shell marker; 404 page metadata shows OG,
  favicon, manifest tags. Bridge NOT live: /api/bridge/handoffs → HTML 404
  (expected — PR #4 merged, deploy pending).
- PASS post-merge chat smoke (conv cmvsd3kwv000008jvtz2ji8ay): Bamboo Dec 1–3 →
  ৳17,000 + quote card, available 4, real SSE phases. Shell/Chat refactor did not
  break the token flow.
- BLOCKED (in order): deploy PR #4 → founder `db push` → founder mint + curls →
  my 401 probes. Nothing else pending on my side; demo prep stays paused.
- SUPERSEDED by next entry (PRs #4 + #5 merged and deployed).

## 2026-10-28 — bridge + settings live, auth guards proven

- PASS bridge no-key → 401 `{"error":"Invalid or missing bridge key."}` (JSON, live).
- PASS bridge bad-key → 401 same shape. A missing table would 500 here, so the
  401 also proves the founder's `db push` landed (BridgeToken table exists).
- PASS signed-out /settings → 307 to /login?next=/settings.
- PENDING founder-side: mint token + run doc curls (paste redacted results);
  eyeball signed-in /settings rooms. Product doc de-tagged to live (uncommitted).

## 2026-10-28 — suite adapter Phases 0-4 built (uncommitted, feature/suite-adapters)

- Phase 0: docs/suite-api-spec.md v1 (ping + 4 proven shapes + optional bearer + 429).
- Phase 1: lib/suite.ts → SuiteAdapter/HttpSuiteAdapter + response guards + default
  path unchanged (tools.ts untouched at this point).
- Phase 2: PropertyBinding reshape, lib/secrets.ts (AES-GCM), adapterForProperty +
  tools/route threading, bindings admin API + two-tier test (ping, else legacy
  lookup-probe), Settings Suite room. Cosmo ping relay deferred per founder.
- Phase 3: RoomMapping, catalogueForProperty, dynamic tool enums + prompt catalogue,
  mappings admin API + seed-from-demo, Settings catalogue room.
- Phase 4: prod URL guardrails, backend-failure health in Settings, BINDING_SECRET_KEY
  in .env.example, spec/product/README docs.
- STATIC PROOF: tsc green; secrets probe 7/7 (round-trip, randomized iv, tamper,
  garbage, empty, short-key fail-closed) on real lib/secrets.ts.
- PENDING post-merge (order): BINDING_SECRET_KEY env → db push → deploy → live
  validation phase-by-phase (suite re-pass, binding-row quote, seed + quote-diff,
  guardrail + health checks).

## 2026-10-28 — RAG onboarding built (uncommitted, feature/rag-onboarding)

- P0: schema (PropertyProfile, OnboardingRun, KnowledgeDocument.propertyId w/ demo
  backfill default) + lib/onboarding.ts (budgets, sanitize, well-known, overBudget).
- P1: /onboarding board (property load, profile form, signed-URL uploads, submit,
  approval box, re-invoke) + admin APIs (status/submit/uploads/approve/invoke).
- P2: worker contract (lib/worker.ts invoke + shared-secret verify), /api/worker/
  callback (progress/chunks/complete/failed, pre-embed ceiling, batch upsert),
  embedMany batch API, worker/onboarding.py Modal app (well-known-or-crawl,
  7 formats, chunker, stop protocol) + deploy README.
- P3: retrieval propertyId filter, persona wire-up into systemPrompt, approval flip.
- P4: docs/onboarding.md operator guide, env template, product/README bullets.
- STATIC PROOF: tsc green; py_compile OK; 17/17 pure probes (budgets, sanitize,
  well-known, overBudget, worker secret) on real libs.
- PENDING founder lift (order): envs (SUPABASE_URL/SERVICE_KEY, WORKER_SHARED_SECRET,
  MODAL_WORKER_URL) → bucket SQL → db push → Modal deploy → app deploy → live
  onboarding trial on a test property.

## 2026-10-28 — worker rework built (uncommitted, feature/rag-onboarding)

- Worker owns embed + store: Modal Secret gains GEMINI_API_KEY + WORKER_DB_URL
  (least-privilege role via docs/worker-db-role.sql, never service-role);
  chunks staged indexed=false, flipped on completion; raw bundle to Storage.
- SSRF guard on every fetch (public-only + redirect re-validation + caps);
  auth via timing-safe payload secret (no implied header security).
- App trimmed: callback is progress/complete/failed + budget stop-authority;
  invoke passes storageHost + rawUploadUrl; dashboard polls to terminal.
- Retrieval filters indexed=true; KnowledgeChunk.indexed defaults true (no
  backfill; worker always stages false explicitly).
- DEVIATION from plan: full RLS-with-session-var deferred — enabling RLS
  without proving the app role bypasses it could break live reads. Shipped
  least-privilege GRANTs + fail-closed insert helper (re-reads document
  property) + CHECK constraint; RLS stays a documented, verifiable follow-up.
- STATIC PROOF: tsc green; py_compile OK; guard probes 33/33 on real worker
  code via import stubs (11 blocked IPs incl. metadata/link-local/multicast —
  the probe caught Python's is_global multicast quirk, fixed explicitly;
  7 URL rejects, chunker, vector format, insert fail-closed ×3).
- PENDING founder lift (order): role SQL → db push → Modal secret additions →
  redeploy worker + app → live adversarial trial (metadata-URL run must fail
  closed with zero chunks; fixture run lands indexed).

## 2026-10-28 — P0 sweep: 6/7 green, prod chat red (our side, not Cosmo)

- PASS: app home 200, bridge unauth 401, /settings 307→login, widget
  handshake accept + reject, demo1 widget tag present.
- FAIL: live chat quote returns "The resort's booking connection needs
  attention." Root cause: prod main = 8d007f7 (adapters); chat route calls
  adapterForProperty + catalogueForProperty, which query the NEW
  propertyBinding/roomMapping tables; prod DB not migrated → throw → that
  exact error (app/api/chat/route.ts:229-234).
- demo1 Suite is HEALTHY: direct availability probe Bamboo Dec 1–3 →
  available: 4, HTTP 200. No Cosmo action needed.
- ALSO FOUND: PR #6 (RAG) is NOT merged — main tip is 8d007f7. Merge order
  must be #6 first, then tenant work (feature/tenant-core stacks on it).
- PENDING founder action (blocks P0): run `pnpm exec prisma db push`
  against the PROD DB from outside the sandbox, confirm, then P0 re-runs.

## 2026-10-28 — P1 built, static proof green (uncommitted, feature/tenant-core)

- Tenant model: Property (slug id, name, widgetKey, status) + User (email,
  scrypt hash, SUPER_ADMIN/OWNER, nullable propertyId). No signup route
  anywhere; rows come from prisma/seed-tenants.mjs only (idempotent upserts:
  property + domains + owner; passwords from TENANT_PASSWORD_<SLUG> env,
  min 12 chars; empty ownerEmail seeds property without a user).
- Sessions v2 (role + property; v1 rejected — one global logout on deploy).
  Login: email+password user path (dummy-hash timing cover, owner fails
  closed on missing/inactive property) + password-only founder bootstrap.
- Enforcement: lib/tenant.ts (getSession/sessionCan/resolvePropertyId);
  /admin super-only; /staff /settings /onboarding + all 10 /api/admin/*
  routes property-scoped (by-id cross-property reads answer 404, never 403);
  onboarding approve is SUPER_ADMIN-only (owners can't self-approve reruns);
  direct-chat token follows the resolved property (signed-out keeps demo).
- Widget keys resolve static-first, Property-table-second (inactive unknown).
- STATIC PROOF: tsc green; 18/18 auth probes on real lib/auth.ts (scrypt
  round-trip/wrong/malformed/version/lengths/dummy/salt, session mint/
  round-trip/super/garbage/empty/tamper/v1-reject/owner-without-property/
  bad-role/expiry); 3/3 seed parity (seed hash verifies in app verifier).
- NOT yet proven live (needs founder db push incl. new tables + deploy):
  owner login, seed run, page/API scoping, both-direction isolation.

## 2026-10-28 — P0 GREEN 7/7 after founder db push (prod main 8d007f7)

- Sweep: home 200, bridge 401, /settings 307→login, handshake accept +
  reject, Bamboo Dec 1–3 2026 → ৳17,000 card (available: 4), demo1 widget tag.
- Baseline extra: Bengali dated total ৳17,000 ✓; lookup RES-202610-00001 →
  "Hi Arisha … 2026-10-28 → 2026-10-29, PENDING", zero contact leak ✓.
- FLAKINESS NOTE (probe, not product): year-less "Dec 1 to Dec 3" makes the
  agent sometimes ask for the year — probes now pin 2026. Product wart for
  P6 polish: prompt should assume the nearest upcoming year and state it.
- This is the regression baseline every later phase re-proves (quote-only;
  no draft writes burned — draft loop stays proven by RES-202610-00001/2).

## 2026-10-28 — P2 built, static proof green (uncommitted, feature/tenant-core)

- FixtureSuiteAdapter (demo-config/fixture.ts + lib/suite.ts): same contract,
  no HTTP; deterministic full availability; totals from shared quoteForStay
  (drafts always match quotes); FIX- drafts in process memory (restart wipes,
  lookup then 404s honestly); details stub { sent: true }; ping v1.
- Precedence: fixture registry → binding row → demo env fallback → honest
  throw. Fixture wins even over a row (graduate by deregistering commit).
- Seabreeze rooms ride the seed file (harbor ৳12,500 fx-harbor-suite, dune
  ৳6,800 fx-dune-room); Krishnachura keeps file fallback (no seed rooms).
- Chat emits per-turn resolution log (property/adapter/rooms/persona).
- STATIC PROOF: tsc green; 15/15 probes on compiled real suite.ts with NO
  database env (precedence, availability ×4, draft code/total parity
  2,500,000p, lookup round-trip/unknown/namespaced, guest/room validation,
  details stub, ping). HttpSuiteAdapter untouched.
- NOT yet proven live (needs PR #6 merge + P1 tables + deploy + seed run):
  seabreeze chat quote/draft/lookup, Krishnachura fallback unchanged.

## 2026-10-28 — P3 built, static proof green (uncommitted, feature/tenant-core)

- Embed tokens (lib/auth.ts): 15-min, property + origin bound, kind:"embed"
  (mutually exclusive with chat tokens, probed both directions).
- Mint POST /api/bridge/embed-tokens (bridge-key ONLY, no chaining);
  origin must be full https (http loopback in dev only).
- Iframe GET /staff/embed?token= (bare, outside shell): verifies token +
  strict Referer-vs-bound-origin check (missing/mismatch = error panel, no
  fallback); widget re-verifies per API call; 401 → "refresh dashboard".
- All 4 bridge handoff endpoints accept key OR embed (same scoping, same
  404 rules); error text now "bridge credential" (statuses unchanged).
- Widget UI: status filter, list, transcript, notes, assign, close/reopen.
- STATIC PROOF: tsc green; 7/7 token probes (real auth.ts); 25/25 bridge
  probes (compiled real bridge.ts, NO database env: 14 origin, 8 referer,
  3 dual-auth). Honest limits documented (no frame-ancestors v1, 15-min
  theft window, no-referrer dashboards can't embed).
- NOT yet proven live (needs deploy + a bridge key + dashboard page):
  mint → iframe load → note/assign/close round-trip; referer reject live.

## 2026-10-28 — P5 built, tsc green (uncommitted, feature/tenant-core)

- Settings is now the single config surface: Chat widget codes, Widget
  domains (moved), Staff bridge codes + iframe/mint snippets (new), Bridge
  keys (moved), Suite connections, Room catalogues, Secrets (honest Later),
  Security (+owner-logins +embed-token rows), Profile (role-aware),
  Appearance (honest Later). Zero "manage in Admin" links remain.
- /admin repurposed to super-only ops overview: Properties & owners table,
  Onboarding re-run approvals (new component, super-only API), cross-property
  backend failures.
- Nav: Talk/Manage/Configure groups + icons; /admin hidden for owners.
- Brand: chat-widget error panel carries the mark (header + bubble already
  did); staff iframe + its error panel branded; login/shell branded.
- BUG FIX: /widget used static-only key lookup — seeded keys (seabreeze)
  would handshake OK then fail to render. Now resolveWidgetProperty.
- Approve controls hidden from owners on the board (API already rejected).
- STATIC PROOF: tsc green; stale-/admin sweep clean (code + live contract
  doc; suite-adapter-plan kept as the historical record it is).
- NOT yet proven live (needs deploy): consolidated settings render, admin
  ops render, seeded-key widget render, nav groups.

## 2026-10-28 — Auth Tier 1 built, static proof green (uncommitted, feature/auth-tier1)

- Server-side session allowlist: cookie keeps signed payload + server-minted
  sid; live = row exists + unrevoked + unexpired + 24h idle; row must agree
  with payload on uid/role; lastSeenAt touched every 5 min max. Pre-Tier-1
  tokens (no sid) rejected — one global logout on deploy.
- Kill switches: logout revokes one row; password change + admin revoke-all
  act per user; deactivation revokes too. Fixation impossible (server-minted
  sids only); multi-device allowed.
- Login throttling (DB-backed): 5 fails/15min per email OR 20/15min per IP
  → 429; throttled hits not logged (no self-extending block); attempts +
  dead sessions pruned opportunistically.
- Password change (owners): PATCH /api/auth/password, min 12, revokes all
  sessions + clears cookie (re-login); bootstrap refused with directions.
  Settings Profile hosts the form + temp-password banner.
- Registration UI (super-only): /admin/register + POST /api/admin/properties
  creates property + domains + owner with shown-once temp password (409s on
  dup id/key/email); seed file stays as bootstrap/recovery path.
- User controls: PATCH /api/admin/users (deactivate reactivates + revokes),
  POST .../revoke-sessions; Admin ops list embeds per-owner actions; nav
  gains super-only Register (prefix-matched filter).
- STATIC PROOF: tsc green; 19/19 probes on real lib/auth.ts (sid mint/
  round-trip/refusals ×3, temp format/unique, throttle ×4, slug ×5,
  email ×3). Allowlist/touch/throttle-count paths need DB — live only.
- NOT yet proven live (needs PR #7 merge + this branch merge + db push with
  Session/LoginAttempt/mustChangePassword + deploy): login rows, throttle
  429s, revoke propagation, register → temp login → change → relogin loop.

## 2026-10-28 — settings page built (uncommitted, feature/settings-page)

- BUILT /settings (admin-guarded): per-key chat embed snippets + copy (origin from
  live headers), staff bridge curl/Node snippets, Secrets + Appearance Later
  placeholders, live security status board, profile + sign out. Sidebar gains
  Settings nav. CopyButton + SignOutButton client components.
- TSC green. Live checks post-deploy: signed-out /settings → /login (I curl);
  signed-in rooms render (founder, admin session).
