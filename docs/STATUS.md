# STATUS (snapshot: 2026-11-04, HEAD at write: 2a8708f)

One page: what this is, what the numbers are, what is proven live,
what is still open. The journal is docs/evidence-log.md (append-only
history); this is the dashboard (rewrite in place as facts change).

## What it is

Vivereply Concierge: multi-tenant AI front desk for resorts. Guests
chat on the resort site (embed widget); the Muse Spark tool-use loop
checks live availability, quotes exact totals, holds booking drafts,
verifies bookings without leaking PII, takes handoffs, and points
held drafts at the resort's own pay page (guest money never touches
us; our subscription billing is an off placeholder). Owners onboard
via public signup + guided /setup wizard; staff triage in /staff.
Two tenants: krishnachura-resort-2e1399 (signup-created, Suite-backed
demo1.vivereply.com, 5-room catalogue, 5-doc RAG) and seabreeze-test
(fixture double for eval + probes).

## The numbers

- 98 unit tests, 19 eval cases (7 guardrail attacks), 10 isolation
  probes — all green on live state (eval 19/19, probes 10/10).
- Prompt v10 (pay-page phone line); Suite spec v1; 9 chat tools;
  6-turn budget; 60s model timeout; 15s Suite timeout.
- Docs: 47 files — architecture, ADRs, runbooks (deploy, ops-down,
  rotation, offboarding, incident), eval/probe harnesses, owner
  guide, pricing + phase-2 roadmaps.

## Proven live (Nov 4 pass)

- Reachability 200s (app, demo1, widget.js, pay page); healthz deep
  ok + db up on HEAD; owner login + /staff /settings /onboarding.
- Guest quote turn: Terracotta Nov 12–14 → ৳29,000 card
  (available:1; Nov 10–12 sold out mid-day — windows move).
- RAG grounding live (seeded 5-doc corpus; crawl blocked by
  demo1 robots.txt — owner-consent worker fix is post-submit).
- Pay deep link 200 + byte-identical anti-enumeration 404s;
  widget handshake + per-message domain re-check green.
- Full button loading-state + double-click-guard sweep; prompt
  v10 + catalogue re-flip + worker-verdict fix deployed.

## Still open (founder-only — nothing here is codeable from outside)

- Tag submission-nov4; film (scripted, windows verified); portal:
  video link, rules/weights/caps, contributor entry, repo tag URL.
- Post-submit hygiene: rotate ADMIN_PASSWORD + seed password,
  delete typo Modal secret, re-apply .env.example structure.
- Post-submit product: robots-consent crawl fix, stats case-bug
  fix, per-tenant quotas, 2FA/password-reset, RLS hardening.

## Where to go next

- Hackathon countdown: docs/hackathon-final.md (Nov 1→9, day by day).
- Rehearsal QA: docs/demo-test-plan.md + docs/live-test-checklist.md.
- Submit day: docs/morning-of-protocol.md → docs/portal-runbook.md.
- After judging: docs/phase2-roadmap.md (+ docs/phase2/ detail docs).
- Money: docs/pricing-worksheet.md (fill from dashboard numbers).
- Client side: docs/client-requirements.md (send to resort
  webmasters) + docs/owner-guide.md (send to owners).
