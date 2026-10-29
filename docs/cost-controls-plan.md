# Cost controls: per-property budget + cutoff + kill switch

**Status: PLANNED, not implemented. Post-hackathon work — do not build
before Nov 9.** (Thinking guide, section G.) The problem it solves: the
provider's "Spend Limit" alerts do not stop billing. Ours must — no
tenant's buggy loop or traffic spike may run up an unbounded bill.

## Why tokens, not money (for now)

There are no verified per-token prices for Muse Spark, so budgets are
counted in **tokens and turns** (measurable today from `model_call` log
rows), not dollars. Money math unlocks only when real prices exist; until
then the dashboard reports burn and the cutoff fires on it. An invented
price would be worse than no number.

## Design

**Budget.** Each property gets a token budget per period (e.g. 1M
tokens/week for pilot tenants — number TBD with the founder at build
time) plus an alert threshold (e.g. 80%). Usage is summed live from
`ToolCallLog` at demo scale; a daily rollup table replaces the live sum
when it gets slow.

**Cutoff.** When a turn would start over budget, chat refuses with a
polite "temporarily unavailable" line and the owner + super-admin get an
alert. If the budget *check itself* errors (transient DB blip), the turn
runs anyway and the error is logged — a hotel must not go silent over a
hiccup; the next turn re-checks. (Deliberate fail-open, recorded here.)

**Kill switch.** One action that pauses a property's chat instantly on a
cost anomaly. A killed property refuses every turn until un-paused. The
kill flag is fail-closed (a deliberate human stop must hold even when
other queries error). Who may pull it: the property's owner for their own
property, the super-admin for any property.

**Where it lives.** Enforcement point is `POST /api/chat`, right before
the agent runs (marked with a TODO in the code). UI: a "Usage & limits"
room in Settings (this property's burn + budget + pause button) and a
super-admin overview in Admin. Runs in the eval set must include an
over-budget refusal case once this ships.

## Build checklist (post-hackathon)

1. Schema: budget + period + kill flag per property (columns or table).
2. Enforcement in the chat route: killed → refuse; over budget →
   refuse + alert; check-error → run + log.
3. Owner alert path (email? dashboard banner? — no alert infra exists
   yet; decide at build time).
4. Settings "Usage & limits" room + Admin overview + kill buttons.
5. Eval case: over-budget turn refuses politely, no model call burned.
6. Founder decisions needed then: pilot budget numbers, alert
   threshold, paid-tier limits, money math if prices exist.
