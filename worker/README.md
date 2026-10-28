# Onboarding worker (Modal)

Cloud half of the RAG onboarding engine. Deploys separately from the
Next.js app — the app invokes it over HTTPS and receives signed callbacks.

## What it owns

Crawling, parsing, chunking. Nothing else: keys, budgets, embeddings, and
the database stay in the app. It stops the moment any callback answers
`{"stop": true}`.

## Deploy (founder, one sitting)

1. `pip install modal && modal setup` (Modal account; token stays local).
2. Create the secret (values never in chat or repo):
   `modal secret create vivereply-onboarding APP_BASE_URL=https://app.vivereply.com WORKER_SHARED_SECRET=<same value as the app env>`
3. `modal deploy worker/onboarding.py` → copy the printed web endpoint URL.
4. Set `MODAL_WORKER_URL` to that URL in Vercel + local `.env`.
5. Submit a test onboarding run; watch `modal app logs vivereply-onboarding`.

## Invoke contract

```
POST {MODAL_WORKER_URL}  Authorization: Bearer <WORKER_SHARED_SECRET>
{ "runId", "propertyId", "website": "...|null",
  "files": [{ "path", "downloadUrl" }], "version": "1" }
```

The endpoint answers `{ accepted: true }` fast; work continues in the
background and reports to the app callback (see `app/api/worker/callback`).

## Limits (mirrored in `lib/onboarding.ts` — keep both in sync)

50 pages · 200k chars · 2MB well-known doc · 2MB per page · ~500-token
chunks (200 overlap) · 50 chunks per callback · 2000 chunks per run.
Python deps are pinned in the Modal image inside `onboarding.py`.
