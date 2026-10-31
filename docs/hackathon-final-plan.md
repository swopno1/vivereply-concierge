# Hackathon final plan (locked 2026-11-01)

The single plan. Cosmo (demo1/docs repos) advises; this repo executes.
Target: submission evening Nov 4 with ~12h buffer. Filming Nov 3 is
the immovable day — everything protects it.

## Freeze #2 (in force until submission)

- **Frozen:** `app/api/chat`, `lib/tools.ts`, `lib/prompts.ts`,
  `lib/agent.ts`, `lib/meta.ts`, `lib/cards.ts`, `public/widget.js`,
  `app/widget`, `demo-config/*`, `eval/cases.mjs`. Merges only if the
  founder names them explicitly.
- **Open per-approval** (founder's `commit` = approval): docs, README,
  scripts, eval/probe runners (not cases), results JSONs, marketing
  assets, Settings/staff/setup UI off the chat path.
- Product-track ideas (notification floor, draft recovery, triage,
  revenue brief) start on post-submission branches. Nothing before.

## Held (verified, not claimed)

- Eval **19/19** on prompt v8 (`e4f0f2a`) — behavior proof.
- Probes **9/10** — 10th (rag-silence) needs reference docs in prod;
  documented environmental ceiling, not chased.
- Unit suite **81/81**, typecheck + prod build green.
- Live: app + demo1 up, widget handshake green, 2-night quote→draft
  loop + Bengali totals proven live (footage pending Nov 3).
- Positioning: "a front-desk agent that acts on live data, not a
  chatbot that answers." RAG is the FAQ corner nobody pitches.
- 60s video script + 7-asset capture checklist ready.
- Nightly drift alarm fixed; needs one green re-run.

## Open (the entire todo list)

1. Submission text (not written).
2. Video (not recorded): 60s core; 3-min cut only if the portal cap
   allows — check cap Nov 2, film once, cut down.
3. Portal rules checkbox (confirm BEFORE Nov 4).
4. Freshness pass: README, `docs/ARCHITECTURE.md` (both exist).
5. Nightly workflow: one green re-run.
6. Evidence files: commit 19/19 + 9/10 JSONs.
7. Mobile checklist (10-min device pass).

## Nov 1 (today) — lock the proof

- [ ] Push main, confirm Vercel deploy green.
- [ ] Re-run nightly-contracts workflow → green.
- [ ] Commit evidence JSONs.
- [ ] Confirm portal video cap + rules checkbox (move this here from
      Nov 4 — no surprises on submission day).
- [ ] Cosmo runs demo1-side live pass on request (site, handshake,
      availability re-probe).

## Nov 2 — assets + polish

- [ ] Capture the 7 visual assets (`docs/visual-assets.md`).
- [ ] Mobile checklist on two devices.
- [ ] Re-probe demo windows; record exact numbers.
- [ ] Freshness pass: README, ARCHITECTURE (resort-pay, v8, wizard).
- [ ] If 3-min allowed: extend the video script (cut 60s from it).

## Nov 3 — filming (no code day)

- [ ] Morning re-probe of demo windows (Terracotta + backup).
- [ ] Mint fresh draft + handoff for the honesty beat.
- [ ] Record per script, burn captions, export 1080p.
- [ ] True emergencies only — anything else waits.
- Rule of the day: energy management beats scope. Protect filming.

## Nov 4 — submission (evening, ~12h buffer)

- [ ] Submission text: booking-loop lead, RAG-boundary line, roadmap
      trio (notification floor → draft recovery → triage + brief).
- [ ] Video upload (Public/Unlisted) + embed test + thumbnail.
- [ ] Portal submit, rules accepted, contributors correct.
- [ ] Tag `submission-nov4`, push tag. Done. Rest.

## Contingencies

- Demo1 down on filming day → fixture-backed beats are scripted in
  `docs/demo-script.md` fallbacks; film those, note honestly.
- Model outage mid-film → Baseten fallback is automatic; if both are
  down, film UI beats (setup, staff board, settings) and voice-over
  the chat beats from the passing eval transcripts.
- Never submit at the deadline. The buffer is the feature.

## After Nov 9 — product track opens

Order: notification floor (the unlock) → draft recovery → in-stay
triage → revenue brief → the rest. Each on its own branch, each with
its own eval/probe evidence, same as this race was run.
