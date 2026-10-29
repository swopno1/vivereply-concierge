# Eval set — the referee

Twelve cases that decide whether a prompt, model, or catalogue change is
safe. Re-run before every such deploy; per-category rates are reported
**unblended**. (Why: a 95% hiding 0% on guardrails is a lie. See
`notes_checklists/1. muse-api-optimization-thinking-guide-2026-10-29.md`.)

## Run

```sh
EVAL_PASSWORD='<sabreeze current password — see docs/seed-users.md>' pnpm eval
```

- Logs in as the **fixture** property's owner, mints a direct token, and
  refuses unless the token's property is `seabreeze-test`. Eval drafts are
  in-memory `FIX-` codes — no real Suite writes are possible on this path.
- `-- --case=<id>` runs one case; `-- --list` prints the set (no network);
  `-- --base-url=` targets local dev (`pnpm dev`) instead of production.
- Full run: ~12 cases, ~20 turns, ~30–40 model calls. Results save to
  `eval/results/<date>-<commit>.json` with the commit hash baked in.
- Exit code is non-zero on any hard failure. Soft warnings (fixture-memory
  lookups on serverless) print but never fail the run — the reason is
  documented on the case, not hidden.

## Settings UI

Super-admins can also run the exam from **Settings → Chatbot exam**
(full set or one case, with live progress). Same cases, same checks —
the API route imports this directory, single source of truth. No password
needed there: the server mints the fixture token itself, and the route
refuses non-super-admins. Results stay on the page — copy the JSON before
leaving. If a run ever outgrows the page (slow network, long set), the
terminal above is the fallback.

## The set

| category | cases | what it guards |
|---|---|---|
| greeting | greet | no invented facts in small talk |
| faq | faq-unknown | don't-know + handoff when ungrounded |
| quote | quote-exact, quote-compare | exact totals, multi-room |
| draft | draft-flow | quote-first, totals match |
| verification | verify-draft, lookup-code, contact-generic | minimal disclosure, generic contact reply |
| handoff | handoff-group | group request lands a handoff card |
| guardrails | no-invent-room, injection | catalogue honesty, prompt secrecy |
| i18n | bengali-quote | parity pair of quote-exact |

`bengali-quote` and `quote-exact` ask the same stay in two languages —
that pair is the BN/EN parity metric. A grounded-FAQ case unlocks once a
tenant seeds knowledge via onboarding (Seabreeze currently has none, so
only the don't-know half is testable).

## Dashboard

```sh
pnpm eval:dashboard            # last 7 days
pnpm eval:dashboard -- --days=30
```

Aggregates the logs we already keep: turns, calls/turn, token splits,
fallback rate, per-property burn, tool mix, RAG hit rate. No cost math —
there are no verified per-token prices, and an invented price would be
worse than no number. Needs `DATABASE_URL` and a machine that reaches it.

## Adding a case

1. Add it to `eval/cases.mjs` (self-contained: no cross-case state, any
   order must work; captures only within the case).
2. Run it: `EVAL_PASSWORD='...' pnpm eval -- --case=<id>`.
3. Record the first run's result in the decision log with date + commit.
