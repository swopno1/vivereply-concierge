# Service setup (from scratch, founder only)

Starting over? This is the full list of services and resources the
Concierge needs, in dependency order. Values are NEVER written here —
names only; the template with per-variable notes is `.env.example`
(§1 required in production, §3 demo-only, §6 lives outside .env).
Companion docs: `supabase-record.md` (project facts), `key-rotation.md`
(rotation), `deploy-runbook.md` (push mechanics), `worker/README.md`
(worker deploy), `seed-users.md` (test logins).

## 0. GitHub repo

- Repo `swopno1/vivereply-concierge`, branch `main` is production.
- CI runs typecheck + tests + build on PRs; nightly contracts probe
  the live Suite. Repo secrets for that workflow ONLY:
  `SUITE_CONTRACT_ROOM_ID`, `SUITE_API_KEY` (if the backend needs one).
- Nobody else's repo is ours: `vivereply` (site), `travel-scaffold`
  `client/demo1` (demo backend), `vivereply-documentation` (docs) are
  Cosmo's — change requests only, never direct edits.

## 1. Supabase (database + storage)

1. Create the project (region: nearest your tenants — current prod is
   Seoul; verify in Settings → General). Note the project ref.
2. Enable the `vector` extension (Database → Extensions) BEFORE the
   first `prisma db push` — without it the push dies with `type
   "vector" does not exist`.
3. Copy two URIs (Settings → Database): pooler (port 6543) →
   `DATABASE_URL`; direct (port 5432) → `DIRECT_URL`.
4. Run `docs/worker-db-role.sql` in the SQL Editor: creates the
   least-privilege `onboarding_worker` role (SELECT/INSERT on
   knowledge tables, SELECT on runs — nothing else). Its pooler URL
   becomes `WORKER_DB_URL` in the Modal Secret (§5), never `.env`.
5. Create the private Storage bucket `onboarding-uploads` (exact name
   — `lib/storage.ts` signs URLs against it). No public access; the
   server signs every upload/download with `SUPABASE_SERVICE_KEY`.
6. From an open machine (raw TCP must reach Supabase):
   `npx prisma db push`, then `pnpm seed:tenants` for demo data.
7. Backups: confirm plan + PITR state (Database → Backups) and record
   them in `supabase-record.md`. Schedule a restore drill before the
   first real tenant.

## 2. Vercel (hosting + domains)

1. Import the repo as a Vercel project; framework Next.js; production
   branch `main`.
2. Domains: `app.vivereply.com` → this project (production). The demo
   backend `demo1.vivereply.com` is a SEPARATE project/repo (Cosmo's)
   — do not point both at one deployment.
3. Environment Variables (Production scope): every §1 variable from
   `.env.example`, plus the §2 lines you use. Preview deployments get
   the same EXCEPT: no production keys (test Stripe, test Turnstile),
   and a preview-safe database (branch or throwaway project).
4. Redeploy after any env change — Vercel bakes env at build time.

## 3. Model providers (chat answers + fallback)

1. Meta Model API key (`META_API_KEY`, starts `LLM_`, shown once):
   primary answering backend, model `muse-spark-1.3`. Changing
   `META_MODEL` requires the `model-version.md` procedure (eval first).
2. Baseten key (`BASETEN_API_KEY`, optional): one-shot fallback when
   Meta errors. Works ONLY with the pinned open model in
   `lib/meta.ts`; guest text flows to Baseten on fallback turns.
3. Google AI Studio key (`GEMINI_API_KEY`): embeddings ONLY
   (`gemini-embedding-001`, 768 dims) — answering never touches
   Google. The SAME key is copied into the Modal Secret (§5).

## 4. Email + spam defense (signup)

1. Resend: API key → `RESEND_API_KEY`; verify the sending domain in
   DNS, then set `RESEND_FROM` on it (e.g.
   `no-reply@mail.vivereply.com`). Resend's onboarding sender only
   reaches your own inbox — production needs the verified domain.
2. Cloudflare Turnstile: create the widget for the app hostname;
   secret → `TURNSTILE_SECRET_KEY`, site key →
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Signup fails CLOSED without the
   secret. Dev-only test keys are listed in `.env.example` §4.

## 5. Modal (RAG ingestion worker)

1. Account + `pip install modal` + `modal setup` (authenticate to the
   founder workspace).
2. Create the Secret (values are COPIES of §1 — rotate both sides):
   `modal secret create vivereply-onboarding
   APP_BASE_URL=https://app.vivereply.com
   WORKER_SHARED_SECRET=<same 32+ char value as the app env>
   GEMINI_API_KEY=<same embeddings key>
   WORKER_DB_URL=<pooler URL for onboarding_worker from §1.4>`
3. Deploy: `modal deploy worker/onboarding.py`; copy the
   `...--vivereply-onboarding-ingest....modal.run` URL →
   `MODAL_WORKER_URL` in Vercel. Without it, onboarding runs queue
   and `/invoke` retries later.
4. Billing: Modal charges per run-second — the worker idles at ~zero
   between ingestion runs. No shutdown ritual needed.
5. Full CLI transcript lives in `worker/README.md`.

## 6. Stripe (booking payments — optional, OFF by default)

1. Test mode first: restricted secret key (`rk_…`) →
   `STRIPE_SECRET_KEY`; register the webhook endpoint
   `https://app.vivereply.com/api/pay/webhook` for
   `checkout.session.completed` → `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
2. Set `PAYMENTS_ENABLED=true` ONLY for suite properties (fixture
   tenants never get payment tools, even when on). Needs `APP_BASE_URL`
   — deep links build solely from it.
3. Go live: swap to live keys + live webhook, re-run one real
   quote → hold → pay → receipt loop before telling any tenant.

## 7. First boot + verify (15 min)

1. `npx prisma db push` (schema), `pnpm seed:tenants` (demo data;
   logins in `docs/seed-users.md` — rotate after prod seeding).
2. Log in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`; walk `/setup` on a
   fresh test property (domain ACTIVE → widget open → booking green).
3. `curl 'https://app.vivereply.com/api/healthz?deep=1'` → `ok: true`
   + `db: "up"`; `curl https://demo1.vivereply.com/` → 200; one chat
   turn on the widget; Settings loads as owner.
4. Record the Supabase facts + prices in `supabase-record.md`, then
   run the evidence set (`pnpm eval`, `pnpm probes`) and file results
   per `live-test-checklist.md`.

## Service inventory (at a glance)

| Service | What for | Where configured | Optional? |
|---|---|---|---|
| GitHub | repo + CI + nightly secrets | repo settings | no |
| Supabase | Postgres + Storage | dashboard + SQL | no |
| Vercel | hosting + env + domains | project settings | no |
| Meta Model API | answering (Muse Spark) | Vercel env | no |
| Google AI Studio | embeddings | Vercel env + Modal | no |
| Resend | verification email | dashboard DNS + Vercel | no |
| Turnstile | signup spam defense | Cloudflare + Vercel | no |
| Modal | ingestion worker | CLI + Secret | yes (RAG only) |
| Baseten | model fallback | Vercel env | yes |
| Stripe | booking payments | dashboard + Vercel | yes |
