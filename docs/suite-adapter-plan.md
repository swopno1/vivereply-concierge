## Goal

Replace the single static Suite endpoint (`SUITE_API_BASE_URL` → demo1) with a
pluggable backend layer: any booking backend that implements our published
contract connects through configuration alone (base URL + key + room mapping),
managed in the Settings page. No code changes per resort, ever again.

## Success Criteria

- A versioned Suite API spec exists that a third-party backend can implement
  without reading our code.
- Chat serves live data through a per-property binding (URL + secret +
  catalogue) selected by the token's `propertyId`.
- demo1 keeps working identically throughout (zero-regression cutover).
- Every phase lands independently deployable with live evidence per claim,
  following the existing evidence-log discipline.

## Approach

Contract first, then seams, then storage, then UI. Current facts grounding
this: `lib/suite.ts` hardcodes 4 endpoint shapes (availability, bookings
POST, lookup, send-details); `demo-config/rooms.ts` hardcodes catalogue +
UUIDs; `PropertyBinding` exists in schema but is unused; `SUITE_API_BASE_URL`
+ `DEMO_PROPERTY_ID` come from env; response guards already follow a
hand-rolled style (`lib/cards.ts`); crypto uses Node stdlib only.

**The v1 contract** (new `docs/suite-api-spec.md`, `X-Concierge-Suite-Version: 1`):
the 4 proven shapes, plus REQUIRED `GET /api/concierge/ping` (powers Test
connection without touching data) and optional bearer auth (Concierge sends
`Authorization: Bearer <secret>` when a binding stores one; keyless backends
ignore it). Lookup keeps demo1's field names (`checkInDate`/`checkOutDate`).
429 joins the spec (the agent already handles rate limits).

**The seams:**

1. Adapter interface: `lib/suite.ts` becomes `SuiteAdapter` + `HttpSuiteAdapter`
   built per call from a binding. Hand-rolled response guards (no new deps):
   backend garbage → honest "the resort's system answered unexpectedly" +
   handoff offer, never a crash or invented number.
2. Binding store: activate `PropertyBinding`
   (`propertyId → suiteBaseUrl + secretRef + version + lastTestedAt`). Missing
   binding → honest "not connected" + handoff.
3. Secret storage: binding secrets are SENT to backends, so unlike bridge keys
   they cannot be hashed — AES-GCM encrypted at rest via new
   `BINDING_SECRET_KEY` env (Node `crypto` only, new `lib/secrets.ts`).
   Server-side only; UI shows set/not-set + rotate, never values. This gives
   the Settings Secrets placeholder its first real content.
4. Per-property catalogue: new `RoomMapping` table
   (`propertyId, slug, name, basePricePoisha, suiteRoomId, highlights`);
   `rooms.ts` stays the krishnachura default. Quote math unchanged (local
   prices, Suite total governs). The open row-by-row UUID check folds into
   seeding this.
5. Settings room "Suite connections": list bindings + add/edit + server-side
   Test connection (ok/fail + latency, never the secret) + mappings overview.
   Placement: Settings, not /admin — Admin guards access, Settings configures
   behavior.

**Compatibility (no flag day):** env fallback remains (no binding row → old
path); demo1 seeded as default binding; local dev and the demo flow work
untouched throughout. Rejected alternative: big-bang cutover — unnecessary
risk with zero benefit given the fallback costs ~5 lines.

## Steps

- **Phase 0 — spec doc only.** Write `docs/suite-api-spec.md` v1 from proven
  shapes. No code. Relay `GET /api/concierge/ping` to Cosmo (additive, tiny).
- **Phase 1 — adapter seam, zero behavior change.** Interface + HTTP adapter +
  guards; default binding from env. Surfaces: `lib/suite.ts`, `lib/tools.ts`
  call sites (unchanged signatures).
- **Phase 2 — bindings + UI.** Migration, `lib/secrets.ts`, Settings room,
  per-request binding lookup by token `propertyId`. Seed demo1 binding.
- **Phase 3 — per-property catalogue.** `RoomMapping` + UI + chat-path switch;
  file becomes seed. Includes the UUID row-by-row verification.
- **Phase 4 — hardening.** Backend-failure audit log, admin-visible backend
  health, rotation without downtime, URL guardrails (https-only, no localhost
  in production).

Non-goals for v1: multi-version negotiation, backend webhooks (Concierge
keeps calling out; backends never call in), per-property RAG (existing
roadmap item).

## Validation Plan

- Phase 0: spec reviewed against the 4 live demo1 responses (curl transcripts
  in evidence log); Cosmo confirms ping shape.
- Phase 1: full existing live suite re-passes unchanged — multi-night
  quote/draft/admin row, code + contact verification, Bengali dated total,
  handoff, widget path (same chat-drive probes as Day 3).
- Phase 2: demo1 served via binding row (quote + draft live); second test
  binding against a stub backend (ok + fail paths); revoke → instant 401;
  rotate → old key dead, new key live. Highest-risk step: first live call
  through a DB binding — validated with a quote-only turn before any draft.
- Phase 3: identical quotes before/after for krishnachura (diff the tool
  outputs); a second property catalogue quotes live end to end.
- Phase 4: kill the stub mid-turn → honest handoff offer observed; audit rows
  present; localhost URL rejected in production.

## Risks / Open Questions

Risks: encrypted-secret key management (new env, founder-held — same trust
model as other secrets); backend response variance in the wild (mitigated by
guards + spec conformance language); scope creep into per-property RAG
(explicitly out).

Open questions (recommendations stated; veto-able):

1. Suite connections UI in Settings, not /admin — ok?
2. Spec auth as optional bearer key — ok?
3. demo1 `GET /api/concierge/ping` — relay to Cosmo now (Phase 0) or later?
