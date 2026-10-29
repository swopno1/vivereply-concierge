# Portal runbook (Nov 4, submission day)

## Before opening the portal

- [ ] Morning-of protocol green (docs/morning-of-protocol.md).
- [ ] `git tag -a vivi-mvp-nov4 -m "Hackathon submission" && git push --tags`
      (tag AFTER the final green commit; paste the tag URL).
- [ ] Clean-clone validation: fresh `git clone` into /tmp, `pnpm
      install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`,
      `pnpm build --webpack` — all green from zero. Log it.
- [ ] Video exported (docs/video-export-preset.md), watched once,
      captions attached if the portal requires them.

## In the portal

- [ ] Accept the rules; confirm eligibility (new work: first commit
      Oct 27, 2026, inside Oct 26 – Nov 4).
- [ ] Confirm track/theme spelling, judging weights (expected
      30/25/25/20 — VERIFY, do not assume), video caps.
- [ ] Paste docs/submission-text.md fields; replace every [VERIFY].
- [ ] Contributor entry: solo founder — VERIFY.
- [ ] Links: live app, demo resort, repo tag URL, video URL — open
      each from the portal preview (clean browser, no session).

## After submit

- [ ] Screenshot the confirmation; note the submission ID + time.
- [ ] Freeze deploys Nov 5–8 (judging) except a downed site.
- [ ] Uptime monitor armed on both sites (external service).
- [ ] Calendar: Nov 9 cron removal (nightly contracts) if the repo
      goes quiet; Nov 16 winners — no action either way.
