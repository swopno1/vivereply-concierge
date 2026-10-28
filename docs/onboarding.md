# RAG onboarding — operator guide

One guided run per property fills its knowledge base: business form +
website (fixed API endpoint or polite crawl) + document uploads → chunked,
embedded, property-scoped vectors. The browser form lives at `/onboarding`
(admin-only for now); heavy lifting runs in the Modal worker (`worker/`).

## One-time setup (founder, in order)

1. `pnpm exec prisma db push` (adds `PropertyProfile`, `OnboardingRun`,
   `KnowledgeDocument.propertyId` with demo backfill, `KnowledgeChunk.indexed`
   defaulting live so existing rows need no backfill).
2. Create the private Storage bucket `onboarding-uploads` — Supabase
   dashboard (Storage → New bucket, private), or SQL:
   `insert into storage.buckets (id, name, public) values ('onboarding-uploads','onboarding-uploads',false);`
3. Run `docs/worker-db-role.sql` (least-privilege worker role + guard
   constraint) as the database owner.
4. Env (Vercel + local, values never in chat): `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY` (service role — server only),
   `WORKER_SHARED_SECRET` (random 32+ chars),
   `MODAL_WORKER_URL` (after step 5).
5. Deploy the worker: `worker/README.md` (Modal account, secret with Gemini
   key + worker DB URL, deploy, webhook URL back into env).
6. Redeploy the app.

## How a run flows

1. Admin opens `/onboarding`, enters the property ID, fills business +
   reply-identity fields, adds the website and/or uploads documents
   (pdf, md, txt, xlsx, xls, docx, csv — bytes go straight to Storage via
   signed URLs, never through Vercel).
2. Submit validates + enforces static caps (≤10 files; each ≤10MB) and the
   once-only gate: a property with any prior run is rejected naming the
   approval path; an approval flip unlocks exactly one more run and is
   consumed by it.
3. The app signs download URLs and invokes the worker; the run goes RUNNING.
   Without `MODAL_WORKER_URL` it waits as PENDING ("Send to worker" retries).
4. The worker tries `/.well-known/vivereply-knowledge.json` first (5s, 2MB
   cap), else crawls politely (robots.txt, sitemap-first, same-origin,
   50 pages / 200k chars), parses uploads, chunks (~500 tokens, 200 overlap),
   and stores rows itself (documents + chunks tagged with the job's property ID, chunks staged unindexed). Every fetch passes the SSRF guard (public IPs only, redirects re-validated, byte caps). It reports progress to `POST /api/worker/callback` (Bearer secret).
5. The worker embeds via Gemini (same model/dims as the app seed path). The app
   enforces the token ceiling on every progress report (500k estimate/run;
   breach → PARTIAL with reason) and answers `{stop}` — true halts the
   worker. On clean completion the worker flips its job's chunks indexed
   (atomic visibility), uploads the raw bundle to Storage for audit, and
   reports COMPLETE with counts.
6. Terminal states: COMPLETE, PARTIAL (budget abort, stats kept), FAILED
   (error kept). Callbacks for terminal runs are ignored (stop: true).

## Client dev note (the well-known endpoint)

To skip crawling, serve this from the property's own site:

```
GET /.well-known/vivereply-knowledge.json
{ "documents": [{ "title": "…", "content": "…", "url": "…" }] }
```

Plain JSON ≤2MB. `content` is raw text (markdown ok); the engine chunks it.
Anything else — missing file, bad shape, timeout — silently falls back to
crawling. Nothing breaks by not having it.

## Limits (honest)

- One run per property; re-runs need a recorded admin approval each time.
- Retrieval stays threshold 0.45 / top 4, now filtered by property.
- Declared upload sizes are trusted at sign time; actual bytes are capped
  by the worker mid-run (caps enforced where the bytes are seen).
- The worker is stateless: killing it mid-run leaves PARTIAL progress in
  place and the run resumable only via a fresh approved run.
