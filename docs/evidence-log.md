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

## 2026-10-28 — settings page built (uncommitted, feature/settings-page)

- BUILT /settings (admin-guarded): per-key chat embed snippets + copy (origin from
  live headers), staff bridge curl/Node snippets, Secrets + Appearance Later
  placeholders, live security status board, profile + sign out. Sidebar gains
  Settings nav. CopyButton + SignOutButton client components.
- TSC green. Live checks post-deploy: signed-out /settings → /login (I curl);
  signed-in rooms render (founder, admin session).
