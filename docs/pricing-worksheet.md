# Pricing worksheet (turn measured cost into tiers)

No prices are set anywhere — this page is the method for setting
them once `pnpm eval:dashboard` has real numbers. Do not fill it
with guesses; a guessed price is worse than no price.

## 1. Collect (founder, after 1–2 weeks of pilot traffic)

From the dashboard (run with pasted $/1M prices):

- `tokens/turn` → call it **T** (prompt + completion, reasoning
  already folded into completion pricing).
- `est. cost` per property per week → busiest property's weekly
  model spend, call it **W**.
- `model calls per turn` → if this climbs past ~2.5, fix the agent
  before pricing (you'd be pricing your own waste).

Add the non-model costs per tenant per month (all founder-known):

- Infra share: Vercel + Supabase plan ÷ tenants → **I**.
- Support budget: hours/month × your hourly value → **S**
  (be honest — night/weekend pages are the real cost).
- Margin target: **M** (3x cost is the starting point for SaaS;
  below 2x you can't afford a bad month).

## 2. Derive (the formula)

- Cost per turn: **C = T × blended $/1M ÷ 1,000,000**.
- Break-even turns per tier: tier price ÷ (C × M).
- Set tiers from turn VOLUME, not features: Starter (e.g. 300
  turns/mo), Growth (1,500), Plus (5,000 + overage). Resorts
  understand "conversations handled", not tokens — quote turns,
  settle on cost.
- Overage per turn: **C × M × 1.5** (overage must sting slightly
  or the tier means nothing).

## 3. Guard (before the first invoice)

- Per-tenant spend alert at 80% of tier turns (email to you, not
  the resort — v1 is manual).
- Hard stop at 120% unless overage agreed (else one viral night
  eats the margin).
- Neither exists in code yet — both are pilot-blockers, tracked
  as the quota TODO in the chat route. Do not invoice until at
  least the alert exists.

## Worked slot (fill with dashboard numbers, not guesses)

- T (tokens/turn): ___
- Blended $/1M: ___
- C (cost/turn): ___
- W (busiest property $/week): ___
- I (infra $/tenant/mo): ___
- S (support $/tenant/mo): ___
- Starter/Growth/Plus $: ___ / ___ / ___
