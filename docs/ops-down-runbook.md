# Ops-down runbook (chat / Meta / Suite / DB)

One page: symptom → check → fix → comms. For tenant isolation
incidents use `isolation-incident-runbook.md` instead; for deploys
gone bad use `deploy-runbook.md` (rollback path).

## Triage first (2 min)

1. `curl 'https://app.vivereply.com/api/healthz?deep=1'` — `ok: true` +
   `db: "up"` means app + DB alive; `db: "down"` (503) means Supabase
   is the fire. (Shallow `/api/healthz` only proves the app boots.)
2. Vercel → Project → Logs: red spike at the same minute as the
   report = our deploy; flat green = a provider is down.
3. Ask: one property or all? One = their binding/domain/status;
   all = us or a shared provider (Meta, Supabase, Vercel).

## Chat down, all properties (guests see "unavailable, try again")

- Check: healthz + Vercel logs for `Completions API` / `timed out`
  lines. One provider error + fallback serves = Meta brown-out,
  guests already covered. `Fallback failed` lines = BOTH providers
  down (double failure).
- Fix: nothing to restart (serverless). If Meta is down >15 min,
  confirm Baseten serves: `BASETEN_API_KEY` set in Vercel?
  Temp-rotate the key if its dashboard shows quota errors.
- Comms: judging week — post in the Day-log thread that chat is
  degraded; do NOT promise an ETA. Tenants: one line per resort
  ("replies may be slow tonight"), no broadcast tool exists yet.

## Suite down (quotes/drafts fail, chat answers otherwise fine)

- Check: Settings → booking connection → Test for the property
  (red = their backend or our binding). `suiteFetch` fails at 15s;
  guests get "The resort's system answered unexpectedly."
- Fix: theirs first (Suite status with the resort's team), ours
  second (binding URL/key rotation per `key-rotation.md` §5).
  Fixture properties are immune — if seabreeze-test also fails,
  it's us, not the Suite.
- Comms: tell only the affected resort. Chat stays up; say quotes
  are paused, questions still answered.

## Database down (healthz `db: "down"`, logins fail)

- Check: Supabase dashboard → project status + `api/healthz?deep=1`. Distinguish pooler (6543) vs direct (5432): CLI `db push`
  uses direct, runtime uses pooler — one can be sick while the
  other serves.
- Fix: wait on Supabase status (no self-heal exists); do NOT
  redeploy (it changes nothing and risks a bad deploy on top).
  After recovery: one login + one chat turn before declaring all-clear.
- Comms: all tenants, one line each. If writes were lost, say the
  window (Supabase incident timestamps).

## Rollback confirm-served (after any rollback)

A Vercel promote is not done until a guest could have been served
by it: `curl` the production URL (not the deployment URL) for
`/api/healthz?deep=1` + one widget-token handshake from an approved
origin, then run `pre-deploy-checklist.md` §Human-eyes. Only then
update the evidence log and tell anyone it's fixed.

## Function timeout budget (no maxDuration set — deliberate)

The chat route declares no `maxDuration`, and that is a decision,
not an omission: the worst-case single model call is ~120s (60s
primary timeout + 60s fallback attempt), so any cap under ~130s
would AMPUTATE the fallback path instead of protecting it. A blind
`maxDuration = 60` breaks more than it fixes (and Hobby plans cap
at 60 anyway — verify the plan before touching this). Typical turns
complete in seconds; the provider timeouts are the real bound. If
Vercel ever kills a long turn, the fix is a plan-aware cap ≥130s,
not a guess.

## Uptime monitoring (recommended, not yet built)

Ping `/api/healthz?deep=1` every 1–5 min from outside Vercel (Better
Uptime / UptimeRobot free tier both do) and alert the founder's
phone. The endpoint is unauthenticated and cheap (one SELECT 1 +
pool checkout). Until this exists, "is it down" is answered by
hand — acceptable for the hackathon, not for tenants.
