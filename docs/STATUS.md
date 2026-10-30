# STATUS (snapshot: 2026-10-30, commit 01eba20)

One page: what this is, what the numbers are, what is proven live,
what is still open. The journal is docs/evidence-log.md (append-only
history); this is the dashboard (rewrite in place as facts change).

## What it is

Vivereply Concierge: multi-tenant AI front desk for resorts. Guests
chat on the resort site (embed widget); the Muse Spark tool-use loop
checks live availability, quotes exact totals, holds booking drafts,
verifies bookings without leaking PII, takes handoffs, and (flag-
gated, Suite-only) presses held drafts toward payment links. Owners
configure everything in Settings; staff triage in /staff. Two demo
tenants: krishnachura-retreat (Suite-backed, demo1.vivereply.com)
and seabreeze-test (fixture double, eval + probes).

## The numbers

- 70 unit tests, 19 eval cases (5 attacks), 10 isolation probes —
  suites green locally; live runs pending (see below).
- Prompt v4 (citation rule); Suite spec v1; 9 chat tools; 6-round
  turn budget; 60s model timeout; 15s Suite timeout.
- Docs: 40+ files — architecture, ADRs, runbooks (deploy, ops-down,
  rotation, offboarding, incident), eval/probe harnesses, owner
  guide, pricing + phase-2 roadmaps.

## Proven live (Oct 30 pass, Run #1 in live-test-checklist)

- Reachability 200×4 (app, demo1, widget.js, privacy); healthz deep
  ok + db up; owner login + /staff /settings /onboarding load.
- Guest quote turn: Terracotta Nov 10–12 → ৳29,000 card (available:1).
- Bengali correction turn + rooftop unknown-turn (honest + handoff).
- Widget handshake mints tokens; error paths JSON-clean.
- Full chat outage found + fixed same-day: throttle tables missing
  in prod (code shipped before `db push`) → founder pushed → green;
  throttles now fail open with alarm + regression test.

## Still open (founder-only — nothing here is codeable from outside)

- Eval 19/19 + temp-0.2 runs, probes 10/10, contracts, dashboard +
  funnel first numbers (needs keys + DB from founder machine).
- Payments trial (test-mode Stripe, end to end) → locks film framing.
- Fallback drill on preview (first live Baseten serve).
- Mobile device pass; clean-clone validation; uptime monitor arming.
- Video: scripted, unfilmed. Portal: rules/weights/caps unverified.
- Seed passwords still active in prod (rotate post-seeding).
- Prod deploy behind HEAD until the next push (verify via healthz).

## Where to go next

- Hackathon countdown: docs/hackathon-final.md (Nov 1→9, day by day).
- Rehearsal QA: docs/demo-test-plan.md + docs/live-test-checklist.md.
- Submit day: docs/morning-of-protocol.md → docs/portal-runbook.md.
- After judging: docs/phase2-roadmap.md (+ docs/phase2/ detail docs).
- Money: docs/pricing-worksheet.md (fill from dashboard numbers).
- Client side: docs/client-requirements.md (send to resort
  webmasters) + docs/owner-guide.md (send to owners).
