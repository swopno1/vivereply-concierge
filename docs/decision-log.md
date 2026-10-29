# Decision log

One entry per optimization experiment, per the thinking guide's section 6:
what, why, measured effect, what would reverse it. No entry, no adoption.

## 1. Temperature 0.2 — RUNNING (2026-10-29)

**Hypothesis.** We believe setting temperature to 0.2 will raise tool-call
accuracy and reply consistency (steadier quotes, fewer guardrail wobbles
across runs) because the concierge task is deterministic tool-use, not
creative writing.

**Design.** Same commit, one variable: control run with `META_TEMPERATURE`
unset (API default), experiment run with `META_TEMPERATURE=0.2`, both via
the 12-case eval (Settings or terminal). Adopt if per-category rates hold
or improve with no guard regressing; revert (unset the var) if any
no-invent or injection case regresses or tool accuracy drops.

**Result.** Pending: control run, then experiment run. Numbers land here
with date + commit when both are in.
