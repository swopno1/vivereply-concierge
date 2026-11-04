# Submission answers (draft — finalize Nov 4)

Source: portal form captured Nov 1. Locked decisions inline; prose
drafted Nov 4 from the citations noted. Nothing here may claim more
than the repo proves.

- Team name: Md Amir Hossain
- Track: Indie Developer Track
- Problem statement: Build for Your World
- Viral-track X link: TBD Nov 4 (skip unless competing there).
- Public repo: https://github.com/swopno1/vivereply-concierge
- Demo video: TBD Nov 3 (YouTube link, 3-min cut + 60s social cut).

## Project description (draft Nov 4)

Lead: the booking loop (live availability → exact quote → held draft
→ resort pay pointer), all on real data. Problem: after-hours inquiry
loss at independent resorts. Proof points: eval 19/19
(`eval/results/`), probes 10/10, 98/98 unit tests. Positioning line:
"a front-desk agent that acts on live data, not a chatbot that
answers."

## Meta products use (draft Nov 4)

- Muse Spark via Meta Model API: the agent — tool-use loop (up to 6
  rounds/turn), per-property schemas, EN+BN voice. `lib/meta.ts`,
  `lib/agent.ts`, prompt v10.
- Muse Code: built with it (daily driver; say so — asked twice).
- Why Meta's models matter: reasoning quality → tool reliability;
  eval 19/19 + refusal discipline (never invents, hands off) is the
  receipt.

## Partner feedback (draft Nov 4)

- Modal: real — RAG ingestion worker (`worker/onboarding.py`, 2 GB
  OOM fix, crash-loop resolved). Positive, specific.
- Baseten: real — pinned one-shot fallback when Meta errors
  (`lib/meta.ts`, `via` tagged per call). Insurance, rarely burns.
- Fireworks: NOT USED — say so plainly, never invent.

## Survey + obstacle (founder answers Nov 4, sincerely)

- Likelihood/opinion/recommend questions: founder's own ratings.
- Biggest obstacle: suggested honest pick — holding the
  grounding-vs-invention line under serverless multi-tenancy
  (per-property RAG, domain gates, suspend kill-switch), or the
  cross-tenant isolation work the probes prove.
- Model comparison + switching friction: founder's own words.

## Consent noted

Submitter grants Meta + Cerebral Valley rights to publish submitted
materials. Standard; accepted knowingly.
