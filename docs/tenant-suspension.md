# Tenant suspension runbook

One action stops a tenant: set the property `INACTIVE` (`/settings`
→ Tenants room → Suspend button, super-admin, or
`PATCH /api/admin/properties { id, status }`). Suspension confirms
first; resuming is one click back.

## What stops, and how fast

- Widget-token issuance: refused on next handshake (generic
  "not approved" message — callers cannot distinguish suspension).
- Guest chat (widget, iframe, and direct scopes): refused on next
  message, before any row is written (generic "unavailable" message).
- Bridge keys: refused on next call (per-request re-read).
- Owner logins: refused; LIVE owner sessions die on next use.
- Staff-embed tokens already minted: refused on next use (every
  embed call re-checks the property is ACTIVE — no tail).

## Suspend procedure

1. `/settings` → Tenants room → property → **Suspend** → confirm. Note time + reason
   (billing, abuse, request) in the evidence log.
2. Verify each surface (replace `ID`):
   - Handshake: `POST /api/widget-token { key }` with the tenant's
     Origin → expect 403.
   - Chat: any existing token → next message → expect 403.
   - Owner login → expect 401; loaded staff page → redirects to login.
   - Bridge: any key call → expect 401.
3. Optional belt-and-braces: `/settings` → Tenants room → owner → deactivate (kills
   sessions redundantly) — harmless, and documents intent.

## Resume procedure

1. `/settings` → Tenants room → property → **Resume**.
2. Verify: handshake 200, owner login works, one test chat quotes.
3. Record the resume in the evidence log.

## Notes

- Suspension is non-destructive: rows, keys, bindings, and corpora
  stay. Off-boarding (deletion) is a separate runbook.
- Never suspend the demo property to test this — use the test
  tenant; `pnpm probes -- --probe=suspend-killswitch` covers the
  full matrix automatically (and refuses the demo property).
