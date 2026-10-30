# Hackathon final (Nov 1 → Nov 9, day by day)

The countdown. Each day has ONE outcome; detail docs do the rest.
Code is frozen for features — from here, only evidence, film, and
fixes that unblock those two.

## Nov 1 (Sat) — Prove it works

- Outcome: every claim in the submission has a committed JSON or a
  screenshot behind it.
- Run: `pnpm eval` (control) + temp-0.2 → decision-log;
  `pnpm probes` 10/10; contracts green; dashboard + funnel numbers
  (paste $/1M inline); fallback drill on PREVIEW.
- Docs: docs/demo-test-plan.md §0–§2 (env prep + beats + drills).
- Record: Run #2 row in docs/live-test-checklist.md.

## Nov 2 (Sun) — Break it on purpose

- Outcome: no surprise left for the camera; go/no-go signed.
- Run: adversarial drills, surface matrix incl. REAL phone,
  payments verdict locked (trialed-live vs built-but-pending),
  §5 go/no-go in the evening (all green or fix-first-thing).
- Docs: docs/demo-test-plan.md §3–§5.
- Record: Run #3 row; script fixes (never footage tricks).

## Nov 3 (Mon) — Film

- Outcome: raw footage of all beats in the can + backup recording.
- Run: docs/morning-of-protocol.md at dawn (re-probe, fresh draft +
  handoff, regression gate) → film per docs/demo-script.md →
  export per docs/video-export-preset.md → watch once end to end.
- Rules: fresh browser profile; alt windows for any re-takes that
  consume units; no record-around-failure (cut the beat instead).

## Nov 4 (Tue) — Submit

- Outcome: submitted + tagged + confirmation screenshotted.
- Run: final green commit → deploy → verify (healthz + one turn) →
  clean-clone validation → docs/portal-runbook.md top to bottom →
  tag `vivi-mvp-nov4` + push tags → portal fields + links + video →
  screenshot confirmation ID.
- Replace every [VERIFY] in docs/submission-text.md with portal
  truth (rules, weights, caps, contributors).

## Nov 5–8 — Freeze (judging)

- No deploys except a downed site (rollback path only, never a
  forward fix under pressure). Uptime monitor armed on both sites.
- Watch: Vercel logs once daily for error strings; do not touch
  config. Answer judge questions if the portal allows.

## Nov 9 — Close

- Calendar item: remove the nightly-contracts cron if the repo goes
  quiet (portal-runbook). Retrospective: what the judges asked,
  what broke, what the pilot needs first.
- Day after: Phase 2 planning opens (docs/phase2-roadmap.md) —
  not before.

## The one-line version

Nov 1 numbers, Nov 2 breakage, Nov 3 footage, Nov 4 paper, Nov 5–8
hands off, Nov 9 close. Anything not on this page is out of scope.
