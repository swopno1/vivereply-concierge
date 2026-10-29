# Deploy runbook (Vercel, founder only)

How a commit becomes production, and how to come back. Read
`pre-deploy-checklist.md` first on every push — this page is the
mechanics, that page is the gate.

## 1. Deploy (normal push)

1. Merge to `main` (PR workflow; CI runs typecheck + tests + build
   + gitleaks). Vercel auto-deploys `main`.
2. Schema BEFORE code needs it: `prisma db push` from the founder
   machine (uses `DIRECT_URL`) any time `schema.prisma` changed.
   Additive-only so far (new models/columns), so pushing schema
   first is safe — old code ignores new tables.
3. Env: production env vars live in Vercel (Project → Settings →
   Environment Variables), full list in `.env.example`. Secrets
   rotate per `key-rotation.md`, never in a deploy.
4. Verify the deployment (5 min):
   - `curl 'https://app.vivereply.com/api/healthz?deep=1'` →
     `ok: true` + `db: "up"` (deep check hits the database).
   - `curl https://demo1.vivereply.com/` → 200.
   - One chat turn on the widget + Settings loads as owner.

## 2. Rollback (bad deploy)

1. Vercel → Deployments → previous production deployment →
   Promote to Production (instant, no rebuild).
2. Schema caveat: `prisma db push` is forward-only — there are no
   down migrations. Rollback is safe while schema changes are
   additive (the usual case). If the bad deploy RENAMED or
   DROPPED a column/table the previous code needs, restore it by
   hand in Supabase SQL Editor before promoting:
   `ALTER TABLE … ADD COLUMN …` / re-run the older `db push`
   from a checkout of the previous commit.
3. After rollback: re-run the 3 verify steps above, then record
   what broke in the evidence log before re-attempting.

## 3. Record-day rule (Nov 3 filming, Nov 4 submission)

No deploys after the morning-of protocol passes except to fix a
down site — and then only the rollback path above, never a forward
fix under time pressure. Freeze details land in the README on Nov 5
(judging week).
