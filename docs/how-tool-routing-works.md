# How the chatbot picks its API: tool routing, end to end

Two separate decisions happen on every guest message, made by two
different actors. Mixing them up is the most common misunderstanding
of this codebase, so the doc leads with the split:

1. **WHICH TOOL?** — decided by the AI model (Muse Spark).
2. **WHICH BACKEND / ENDPOINT?** — decided by our code, never the model.

The model understands guest intent. It never sees a URL, a secret, a
room ID from any Suite, or a database row. All of that lives on our
side of the wall.

## Decision 1: the model picks a tool (or answers directly)

Each turn, the server sends the model four things
(`app/api/chat/route.ts` → `lib/agent.ts`):

- the **system prompt**: behavior rules + this property's room catalogue
  (names, slugs, prices) + verified property facts for this turn;
- the **conversation history** (last 20 text messages — tool transcripts
  are deliberately not carried across turns);
- **7 tool definitions** (`toolDefinitionsFor` in `lib/tools.ts:156`):
  name, plain-English description, and argument schema per tool. The
  room argument is an enum built from THIS property's catalogue, so
  the model can only name rooms the property actually has:

| tool | when the model reaches for it |
|---|---|
| `check_availability` | guest asks if a room is free |
| `get_quote` | guest asks for a price |
| `create_booking_draft` | guest confirmed a quote + gave details |
| `verify_booking` | guest doubts their held draft |
| `lookup_booking_by_code` | guest has a booking code |
| `request_booking_details` | guest gives phone/email instead of a code |
| `request_handoff` | anything complex, unknown, or multi-room |

- nothing else: no endpoints, no keys, no backend names.

The loop (`lib/agent.ts:30`): the model answers or emits tool calls
(several at once when independent — e.g. availability for two rooms in
parallel) → the server executes them → results go back in → the model
reasons again, up to 6 rounds, until it replies in plain text.

Prompt rules steer the picking (always check before quoting; draft only
after confirm + details; code → lookup; phone/email → privacy line +
details request; unknown → handoff), but steering is not trust: the
executor re-validates everything — argument shapes, exact dates, room
in catalogue, quote-before-draft, one draft per conversation
(`createToolExecutor`, `lib/tools.ts:191`).

Note what the model does NOT pick: knowledge retrieval is not a tool.
The server runs it before the agent (skipped only for trivial turns
like greetings) and pastes the result into the system prompt. Cards in
the UI are likewise not model output — they are built from the tool
logs of the same turn, so they can only show what the tools returned.

## Decision 2: our code picks the backend and endpoint

A tool call from the model carries only business meaning: a room slug,
dates, guest details, a code. Which server answers it is resolved
fresh on every turn from the chat token (`app/api/chat/route.ts`):

**token → propertyId → backend + catalogue.** The browser's claimed
property is ignored entirely; only the signed token's property counts
(widget tokens also re-check their domain on every message).

Backend selection (`adapterForProperty`, `lib/suite.ts:263`), in order:

1. **Fixture registry** — a registered test property NEVER touches
   HTTP, even if a binding row exists. Availability, quotes, and
   `FIX-` drafts come from process memory. Graduating is a deliberate
   commit removing it from `demo-config/fixture.ts`.
2. **Binding row** — the property's own backend: its base URL, its
   decrypted secret, its spec version (`PropertyBinding` table).
3. **Demo env fallback** — the demo property only, until it is seeded:
   `SUITE_API_BASE_URL`, no secret.
4. **Anything else fails honestly** instead of borrowing another
   property's backend or rooms. The guest gets a generic line; the
   real cause goes to the server log.

Catalogue selection (`catalogueForProperty`, `demo-config/rooms.ts:54`)
mirrors it: seeded `RoomMapping` rows win; the demo property falls back
to `demo-config/rooms.ts`; anyone else without rows fails honestly.

The executor then translates the model's room slug into the Suite's
own room ID (`suiteRoomId`) and calls the adapter. The HTTP adapter
(`HttpSuiteAdapter`, `lib/suite.ts:104`) builds fixed paths per the
contract (`docs/suite-api-spec.md` v1) — the model never chose these:

- availability → `GET /api/rooms/{roomId}/availability?checkIn=&checkOut=`
- draft → `POST /api/bookings`
- code lookup → `GET /api/bookings/lookup?code=`
- contact details → `POST /api/bookings/send-details`
- health → `GET /api/concierge/ping`

Every call carries the version header, the property's bearer secret
when one exists, a 15-second timeout, and no caching
(`suiteFetch`, `lib/suite.ts:45`). Every response is shape-checked: a
backend answering outside the spec yields an honest "answered
unexpectedly" error — never a crash on missing fields, never an
invented number.

## One message, traced

Guest (Seabreeze test hotel): *"How much is the Dune Room Dec 1–3?"*

1. Token says `seabreeze-test` → fixture adapter + 2-room catalogue;
   tool schemas offer exactly `harbor-suite | dune-room`.
2. Model calls `check_availability` + `get_quote` for `dune-room`,
   2026-12-01 → 2026-12-03.
3. Executor resolves `dune-room` → `fx-dune-room`, validates dates,
   hits fixture memory: 3 units, ৳13,600.
4. Model composes the reply; a quote card builds from the tool log.
5. The model never knew "fixture", "fx-dune-room", or any URL existed.

## The wall, in one paragraph

Intent flows one way (guest → model → tool name + business arguments)
and infrastructure flows the other (token → property → backend +
catalogue → endpoint → validated result). The model cannot reach a
server it was not given, cannot name a room outside the enum, and
cannot see a secret — because none of those ever cross into its
context. That is why a prompt-injection attack can at most confuse the
wording, never the plumbing.
