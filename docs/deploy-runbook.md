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

## 1b. Billing scheduler (Phase 3, one-time setup)

Trial reminders (day 7/21/27/30), trial expiry, and 80% usage alerts
all fire from `GET /api/cron/billing-reminders`. The app lives on
the VM, not Vercel — so the timer lives on the VM too (there is no
Vercel cron; nothing in the app depends on Vercel).

**Where:** host crontab on the Vultr VM (65.20.89.231), under the
same user that runs the app. Add with `crontab -e` on the machine:

`0 9 * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" https://app.vivereply.com/api/cron/billing-reminders >> ~/billing-cron.log 2>&1`

`CRON_SECRET` (random 32+ chars, Vault-held) must be in the app's
env AND available to cron — export it at the top of the crontab
(`CRON_SECRET=vault-value-here`, pasted on the machine, never in
chat or the repo). A systemd timer is an equivalent alternative;
pick one, not both.

**How to check it ran:** (1) `tail ~/billing-cron.log` shows one
`{"ok":true,"checked":N,"reminded":…}` line per day; (2) last-run
proof in the database (latest notice sent):

`SELECT kind, "periodKey", "sentAt" FROM "BillingNotice" ORDER BY "sentAt" DESC LIMIT 5;`

Without a trigger, reminders/expiry mails never fire — but the chat
gate still enforces trial end + quotas on every turn by date, so
billing enforcement never depends on the cron. Verify once after
wiring with a manual curl (same header) → `{"ok":true,…}`.

**Webhook replay (rare):** the webhook claims each Stripe event id
FIRST, so if an apply crashes after its claim (500 in the Stripe
dashboard + `billing webhook: apply failed` in the server log), a
plain redelivery answers 200-duplicate without re-applying. To
replay: `DELETE FROM "StripeEvent" WHERE id = 'evt_…';` in Supabase
SQL Editor, then replay the event from the Stripe dashboard
(Developers → Webhooks → the endpoint → the event → Resend). Only
for events whose 500 you have diagnosed — never bulk-delete claims.

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
