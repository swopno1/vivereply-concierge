# Pre-deploy checklist (founder, before every production push)

CI already gates typecheck + unit tests + build. This is the rest —
the parts that need credentials, the live backends, or human eyes.
Do not deploy with a red line unless the exception is written here.

## Automated (founder machine)

- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green (currently 69 unit tests, no DB needed)
- [ ] `pnpm eval` full pass on the fixture property; results file in
      `eval/results/` committed with date + commit + prompt version
- [ ] `pnpm probes` green (10 isolation probes); failures block deploy
- [ ] `node scripts/check-contracts.mjs` green (demo1 drift check)
- [ ] `pnpm build --webpack` green (Turbopack build is not supported
      in restricted sandboxes; either is fine on a normal machine)

## Schema + secrets

- [ ] `prisma db push` applied if `schema.prisma` changed since last
      deploy (current tables needing prod: `PaymentLink`, `ChatRating`,
      `RateBucket`, `IpRateBucket`, `AuditLog`, `DraftClaim`,
      `WidgetOpen` + Conversation FK cascades + draftClaim relation)
- [ ] New env names (if any) set in Vercel + documented in `.env.example`
- [ ] `PAYMENTS_ENABLED` is intentionally on/off for this deploy
- [ ] Seed test passwords rotated if they ever touched production data

## Human eyes

- [ ] Demo-script pre-filming check passes on the deploy preview
- [ ] Morning-of re-probe protocol scheduled (submission week only)
- [ ] Breaking prompt change? `PROMPT_VERSION` bumped + changelog line
- [ ] Anything in this deploy a judge will click? Click it on preview.
