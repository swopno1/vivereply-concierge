# Architecture decision records

Five structural calls the codebase depends on. One paragraph each:
context, decision, consequence. (Optimization experiments live in
`decision-log.md`, not here.)

## ADR-1: Hand-rolled tool loop, no agent framework

The concierge turn is deterministic tool-use (check → quote → draft),
not open-ended reasoning, and every guard (quote-first, one-draft,
cross-conversation ignore, server-side money) must be provable in a
code read. So the agent is 55 lines of our own loop
(`lib/agent.ts`, max 6 rounds) instead of LangChain/CrewAI: the model
picks tools, our code enforces the order. Consequence: no framework
upgrades, no hidden prompts, and the eval suite tests exactly what
ships — but every new capability is hand-wired.

## ADR-2: App-layer tenant scoping first, RLS scheduled

Every tenant query carries `propertyId` in application code, proven
by 10 HTTP probes (`pnpm probes`), instead of Postgres row-level
security. RLS under a live demo risks breaking legitimate reads, and
unproven RLS is weaker than proven app scoping — so RLS is the
scheduled second layer (design sketch in
`tenant-isolation-decisions.md`), not the first. Consequence: one
missed `where` is a leak, which is why probes (not reviews) are the
gate; flipping RLS on later must re-run the same suite green.

## ADR-3: Secrets never reach the browser

Bridge keys are hashed at rest and shown once at mint; the client
dashboard keeps the key on its server and mints 15-minute
origin-bound embed tokens per page load; Suite binding secrets are
AES-GCM encrypted with set-only/never-read APIs. The widget key is a
deliberately public label — the handshake, not the key, decides.
Consequence: a leaked page source or widget snippet buys an attacker
nothing; the cost is owner friction (keys shown once, secrets
re-pasted not viewed).

## ADR-4: Fixture backend as the deterministic test double

Test properties run against an in-memory Suite implementation
(`FIX-` codes, fixed catalogue) selected by property registry, not
by mocking HTTP. Eval, probes, and load runs hit the real routes
with the real agent loop — only the backend is swapped.
Consequence: 19 eval cases and 10 probes run without a Suite
deployment and mean what they say; the cost is maintaining the
fixture's fidelity to `suite-api-spec.md` (contract script guards
drift).

## ADR-5: Same-payload fallback, not degraded mode

On primary failure the identical request retries once against
Baseten-hosted Muse Spark Open — same tools, same guards, different
weights — instead of serving a canned or reduced answer. Every
fallback serve is logged, and the privacy consequence is stated
plainly (guest text flows to Baseten on fallback turns).
Consequence: guests never see a "dumb mode" tell, and fallback is
honest about where data went; the cost is a second provider key to
rotate and a fallback drill to run before judging.
