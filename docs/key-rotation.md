# Key rotation runbook

When a secret leaks (or on schedule — quarterly for provider keys,
yearly for the session secret), rotate in this order. Every step is a
Vercel env change + redeploy unless noted; nothing here needs a code
change. After any rotation, record the date + reason in the evidence
log and confirm the morning-of probes still pass.

## 1. SESSION_SECRET (hardest — plan for it)

Invalidates every login cookie at once: all owners get signed out and
sign back in. There is no grace window (one secret, HMAC-signed).

1. Generate: `openssl rand -base64 48`.
2. Set in Vercel (production), redeploy.
3. Verify: fresh login works; old cookies get a clean login screen,
   not an error page.
4. Note: bridge keys, embed tokens, and Suite binding secrets are
   unaffected (separate secrets).

## 2. ADMIN_PASSWORD (bootstrap super-admin)

1. Set the new password in Vercel, redeploy.
2. Verify: bootstrap login works with the new password; the old one
   fails closed (generic "Invalid email or password").
3. If the old password leaked AND a session was minted with it:
   sessions are server-side rows — run
   `DELETE FROM "Session" WHERE "userId" IS NULL;` to kill every
   bootstrap session at once (bootstrap rows have no userId).

## 3. Provider keys (META_API_KEY, GEMINI_API_KEY, RESEND_API_KEY)

1. Mint the new key at the provider; keep the old one live.
2. Set in Vercel, redeploy, confirm chat (Meta), onboarding
   (Gemini/Modal secret — see below), and a verification email
   (Resend) all work.
3. Revoke the old key at the provider.

## 4. Stripe (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)

1. Roll the restricted key in the Stripe dashboard; update Vercel.
2. If the webhook endpoint changed: update the endpoint secret too —
   mismatched secrets fail closed (all webhooks 400, card links
   never flip; the Settings payments room shows the indicator).
3. Verify: the payments room shows the expected TEST/LIVE banner;
   mint a test-mode link and complete it before touching live.

## 5. Suite binding secrets (per-property, owner-side)

Owners rotate their own in Settings → Suite connection (paste new
secret → Test → green). No founder action; old secret stops working
the moment the row updates.

## 6. Bridge keys (per-property)

Revoke in Settings → Bridge keys (instant), mint a replacement, hand
it to the client server out-of-band. The old key dies on revoke —
coordinate the swap with the client's deploy.

## 7. Modal worker secret bundle (GEMINI_API_KEY, WORKER_DB_URL, WORKER_SHARED_SECRET)

1. `modal secret create` a new revision of `vivereply-onboarding`
   (or update values in the Modal dashboard).
2. Redeploy the worker; confirm an onboarding run completes.
3. If WORKER_SHARED_SECRET changed, update the matching Vercel env
   in the same deploy window — mismatch fails invocations closed.
4. If WORKER_DB_URL changed (password rotation on the
   `onboarding_worker` role): `ALTER ROLE onboarding_worker WITH
   PASSWORD '…'` first, new URL in the secret second.

## 8. BINDING_SECRET_KEY (encrypts Suite secrets at rest)

DANGER: rotating this orphans every stored Suite secret (they decrypt
to garbage). There is no re-encryption migration. Rotate only if it
leaks, and then: rotate the key, then have every owner re-paste their
Suite secret (Settings shows `secretSet: false` until they do).

## Retention (what we keep, for how long)

| Data | Lives for | Cleanup |
|---|---|---|
| Sessions | 7d absolute, 24h idle (enforced) | opportunistic prune on login |
| Login attempts | throttle window (15 min) | opportunistic prune on login |
| Signup attempts | throttle window (15 min) | prune on signup |
| Email verification tokens | 24h expiry | opportunistic prune on login |
| Rate buckets (tenant + IP) | 2h past the window | prune on each check |
| Audit log | indefinite (append-only) | tenant-scoped delete on offboarding only |
| Conversations/messages | indefinite | tenant offboarding export + delete |
| Server logs (Vercel) | per Vercel plan retention | platform-managed, not in repo |
| Stripe records | per Stripe policy | dashboard-managed |

No self-serve deletion yet: guests ask the resort, the resort asks us
(see `tenant-offboarding.md`). Log retention on Vercel follows the
plan default — revisit before the first real tenant.
