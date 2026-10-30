# AI models + tools (what runs where, and what it costs us)

One page answering "which AI does what in this product, and how does
each choice hit cost, latency, and answer quality". Code refs are the
source of truth; this page explains the WHY.

## The three AI touchpoints (and one non-AI pipeline)

| # | Job | Engine | Runs where | Paid per |
|---|---|---|---|---|
| 1 | Chat answers + tool use | Muse Spark via Meta Model API (`muse-spark-1.3`) | Meta's cloud, called from `/api/chat` | token (prompt + completion + reasoning) |
| 2 | Same job when Meta errors | Muse Spark Open via Baseten (pinned `meta-models/muse-spark-open-1026`) | Baseten's cloud, one retry | token (fallback turns only) |
| 3 | Embeddings (grounding) | `gemini-embedding-001`, 768 dims | Google, called from chat + seeder + Modal worker | token (cheap; short texts) |
| 4 | Document parsing (NOT AI) | trafilatura / BeautifulSoup / pypdf / python-docx / openpyxl | Modal worker | run-second (~zero at idle) |

Deliberate split: the answering brain (1) never embeds, the embedder
(3) never answers, and parsing (4) is deterministic code — no LLM
ever reads raw uploads. That keeps every bill attributable and every
failure diagnosable.

## 1. Muse Spark agent (the product)

`lib/meta.ts` + `lib/agent.ts` + `lib/prompts.ts` (v5). The model
thinks, calls tools (availability, quote, draft, lookup, handoff,
payments…), reads results, and answers — up to 6 rounds per turn.
Per-request tool schemas are built from the property's own catalogue,
so it can only offer rooms that exist.

Impact on cost: this is ~95% of the AI bill. Bounded by design —
measured worst case per turn: system prompt ~1,560 tokens (RAG heads
capped at 600 chars × 4), history 20 messages × 600 chars, reply cap
2,048 tokens. Reasoning tokens count against the cap (observed: 337
reasoning tokens for a one-word answer), which is why the cap looks
generous — it is mostly thinking room, not reply room.

Impact on latency: one model call per round, up to 6 per turn; the
widget streams "checking…" phases so the guest sees progress. No API
knob exists to shorten thinking — latency is what the model needs.

Impact on quality: `META_TEMPERATURE` (default = API default) is the
only wording dial; steadier tool-use comes from low values (see
`.env.example` §2 + `decision-log.md`). Truth comes from tools + RAG,
never from temperature.

## 2. Baseten fallback (demo insurance)

When the Meta call errors and `BASETEN_API_KEY` is set, the IDENTICAL
payload is retried once against Baseten (`lib/meta.ts`). Every call is
logged with its `via` tag, so the dashboard reports the fallback share
honestly. Guest text flows to Baseten ONLY on fallback turns.

Impact: near-zero cost (fallback turns are rare by design), large
reliability gain for live demos. Quality risk: it is a different model
serving the same prompt — evals run against the primary, so treat a
fallback-heavy day as a signal to investigate Meta, not as normal.

## 3. Gemini embeddings (grounding)

`lib/embeddings.ts`, `lib/rag.ts`, `worker/onboarding.py`,
`prisma/seed-tenants.mjs` — all four use the same model, dims, and
task types (`RETRIEVAL_DOCUMENT` at index time, `RETRIEVAL_QUERY` at
ask time). Mismatching any of those silently degrades recall, so the
triple is a system invariant.

Impact on cost: negligible — one short query embedding per
non-trivial turn (greetings skip retrieval entirely), plus batch
indexing at onboarding. Impact on quality: everything — retrieval
threshold 0.45 / top-4 decides what the agent is allowed to know, and
below-threshold turns run UNGROUNDED with an explicit say-unknown
instruction. Tune recall here (threshold, chunking), never by
prompting the agent to "try harder".

## 4. Worker parsing (deterministic)

The Modal worker fetches (SSRF-guarded), parses, chunks (2000 chars /
200 overlap), embeds, and stores. No LLM in the loop: a document can
only become the chunks it literally contains. Budgets (50 pages,
200k chars, 2000 chunks/run) are mirrored in `lib/onboarding.ts` and
enforced on both sides — the app can also abort mid-run via callback.

Impact: predictable cost (run-seconds, pennies per resort) and no
quality drift — parsing never "interprets". Memory floor is 2 GB
(`memory=2048` on the function): the parsing stack OOMs on Modal's
128 MB default, which is exactly what a crash-loop warning means.

## Token budget (measured 2026-10-30, ~4 chars/token)

| Piece | Worst case | Typical turn |
|---|---|---|
| System prompt, grounded | ~1,560 tok | ~800–1,200 tok |
| System prompt, ungrounded | ~925 tok | ~925 tok |
| History (20 msgs) | ~3,000 tok | a few hundred tok |
| Reply + thinking cap | 2,048 tok | well under cap |

`tests/segments-tokens.test.mjs` fails the build if the worst-case
grounded prompt exceeds ~1,800 tokens — budgets are enforced, not
aspirational. Per-tenant runtime quotas are still open
(`cost-controls-plan.md`): today every turn runs.

## Data flow (privacy summary)

- Guest chat text → Meta (every turn), Baseten (fallback turns only).
  Never to Google, never to Stripe, never to Modal.
- Guest questions (embedding form) → Google. Short vectors, no
  conversation history.
- Resort documents → Modal worker + Supabase. Never to Meta/Google
  except as 600-char retrieved heads at answer time.
- Payments: the model sees booking context + method names only — card
  data lives entirely inside Stripe Checkout; pasted card/PIN/OTP in
  chat is never repeated or processed (prompt rule, both languages).

## If the bill hurts (levers, in order)

1. Check the dashboard split: reasoning-heavy? Nothing to cut (no API
   knob) — shorten turns instead (fewer tools per question).
2. Prompt-heavy? History cap and chunk heads are already cut; next is
   top-4 → top-3 (recall trade-off, eval first).
3. Embedding-heavy? Widen the trivial-turn skip list, not the threshold.
4. Set per-tenant quotas (`cost-controls-plan.md`) before tenant #2 —
   a runaway integration is the only uncapped tap left.
