# Architecture

One page: how a guest message becomes an answered booking, where the
trust boundaries are, and what fails into what. Details live in the
headers of the files named below — this page is the map, not the
territory.

## Request flow (guest chat)

```
guest site ──widget.js──> /api/widget-token ──token──> iframe /widget
    │                         │ (Origin host must be approved
    │                         │  for the key's property)
    └───────────── /api/chat (token, message) ──────────────┐
                                                            ▼
                                  1. verify token → propertyId (ONLY
                                     source of tenancy; browser input
                                     never trusted for it)
                                  2. kill-switch: property ACTIVE?
                                     domain still approved?
                                  3. resolve adapter: Settings row →
                                     demo env (demo only) → fixture
                                     (fixture ids) → honest error
                                  4. RAG attempt (trivial turns skip;
                                     always logged, empty or not)
                                  5. tool loop, max 6 rounds
                                     (lib/agent.ts): Muse Spark picks
                                     room-scoped tools, reads live
                                     Suite results, answers or calls
                                  6. persist messages + tool logs,
                                     build cards from same-turn logs,
                                     stream SSE (phase → typing → done)
```

Embeddings at ingestion time only (Modal worker → pgvector);
per-turn retrieval embeds the guest message via Gemini.

## Data flow

- Concierge DB (Supabase Postgres + Prisma): conversations,
  messages, tool logs, handoffs + notes, tenants, users, sessions,
  bindings, catalogues, payment links, ratings, knowledge.
- Suite data is NEVER joined: referenced by ID/code only, fetched
  over HTTP per call (`docs/suite-api-spec.md` v1 contract).
- Secrets: Suite keys encrypted at rest (BINDING_SECRET_KEY);
  bridge keys never reach browsers (server-minted 15-min embed
  tokens instead); Stripe via hosted Checkout (no card data here).

## Trust model (boundaries)

| Boundary | Rule |
|---|---|
| Token → property | Signed chat token is the sole tenancy root; cross-property reads 404, never 403-vs-404 oracle |
| Browser input | Room slugs validated against the property catalogue; amounts/dates re-derived server-side |
| Model output | Untrusted by construction: guardrails (quote-first, one-draft, catalogue-only), response guards on Suite shapes, payment URLs server-minted only |
| Webhooks | Stripe signature verified, timestamp-tolerated, idempotent |
| Sessions | Signed cookie + server row (revocable), 7-day absolute + 24h idle, verified-email gate before config/PII |
| Staff surfaces | Session + tenant + verification gates; bridge API needs the client-server key |

## Failure model (what fails into what)

- Meta down/slow → exactly one Baseten attempt (60s cap per attempt) → logged; double failure throws a safe message, never a leak.
- Suite error/timeout (15s) → honest "answered unexpectedly" + handoff offer; 404/409/429 mapped to guest words.
- Turn budget (6 rounds) → safe message + handoff offer; mid-loop throws become tool results, not 500s.
- RAG/embedding failure → ungrounded turn (must say don't-know), never fatal.
- Suspended property / deapproved domain → immediate refusal on next message (checked per message, not per token).
- Payment link expired/invalid/wrong-booking → one generic face; Stripe double-clicks collapse via idempotency key.

## Tenancy model

Pooled Postgres, `propertyId` on every row, app-layer scoping (no RLS
— stated, deliberate for the MVP). Fixture properties are selectable
only by property id in `FIXTURE_CATALOGUE` (a commit, never data).
Suite users get HTTP backends + payments; fixture ids get the
deterministic in-memory adapter and no payment tools, ever.

## Test seams

Pure logic (rates, language, cards, guards, prompts, payments-pure,
domains, rag filter, auth tokens) runs under `pnpm test` with zero
deps. ToolDb + SuiteAdapter are injected interfaces: unit tests stub
them, eval/probes run them live (fixture backend / two tenants).
