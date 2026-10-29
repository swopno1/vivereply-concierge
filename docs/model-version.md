# Model version procedure (changing what serves turns)

`META_MODEL` is free text by design (founder-only env — see
lib/meta.ts), so discipline lives here, not in an allowlist. Any
change of primary model, fallback model, or provider endpoint
follows this page. No exceptions before judging.

## Detect (is a change coming?)

- Provider deprecation emails / changelog posts for Muse Spark —
  the founder reads these; nothing polls them automatically.
- New error strings in Vercel logs (`model_not_found`,
  `deprecated`) — treat as a forced migration, start below today.
- Quarterly (post-hackathon): ask whether the pinned models are
  still the best choice; "yes" needs no action beyond the asking.

## Test (does the new model behave?)

1. Preview deployment ONLY: set the new `META_MODEL` (or endpoint).
2. Full `pnpm eval` against the preview (19 cases) + read every
   guardrail-category transcript by eye — a green suite with
   worse wording is still a reject.
3. Compare tokens/turn (dashboard) — a 2x cost model needs a
   pricing decision, not just a technical pass.
4. Fallback drill (morning-of §4) still passes: the new primary
   must fail INTO Baseten cleanly, not around it.

## Roll out / roll back

- Roll out: set the env on production, redeploy, watch the first
  10 turns in `/staff` + Vercel logs for error strings.
- Roll back: revert the env var, redeploy. No code changes, no
  migration — a model swap is always one env var. Record both
  directions in the evidence log with date + eval hashes.
