# Morning-of protocol (filming day / submission day)

Run top to bottom BEFORE the camera rolls or the portal submit. Any
red line stops filming until green — a missing beat scores better
than a staged one (see docs/demo-script.md fallbacks).

## 1. Availability re-proof (5 min)

- [ ] `curl -sI https://app.vivereply.com/ | head -1` → 200
- [ ] `curl -sI https://demo1.vivereply.com/ | head -1` → 200
- [ ] `node scripts/check-contracts.mjs` → 5/5 hold (needs
      SUITE_API_BASE_URL + SUITE_CONTRACT_ROOM_ID in env)
- [ ] If demo1 is down: availability contingency in
      docs/demo-script.md applies (state it on camera, film the
      fixture property instead — never fake the live backend).

## 2. Fresh evidence (10 min)

- [ ] Beat 1 window: hold a NEW 2-night draft on the demo property
      (note the code + total for Beat 4's verification).
- [ ] Beat 3 window: trigger a fresh handoff ("25 colleagues…"),
      open /staff, confirm the record + transcript render.
- [ ] Beat 5 window: one Bengali quote exchange, confirm dated total.
- [ ] Payments (only if the docs/payments.md trial passed): mint one
      test-mode link, pay 4242…, confirm paid card + email + row.
      Otherwise present payments as built-but-pending — never film
      an untrialed flow.

## 3. Regression gate (15 min, machine with creds)

- [ ] `pnpm eval` → 18/18 (fixture property); commit results JSON.
- [ ] `pnpm probes` → 10/10.
- [ ] Results stamped with today's commit + prompt version.

## 4. Optional: fallback drill (10 min, judging evidence)

- [ ] On a PREVIEW deployment only: set META_API_BASE_URL to an
      invalid host, send one chat, confirm the reply still lands
      and the tool log shows via=baseten. Restore immediately.
- [ ] Log the serve in docs/evidence-log.md (first proven live
      fallback serve).

## 5. Film / submit

- [ ] Film per docs/demo-script.md (beats 0–5 + fallbacks).
- [ ] Export per docs/video-export-preset.md; watch once end to end.
- [ ] Submit per docs/portal-runbook.md.
