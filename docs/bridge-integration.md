# Staff bridge — server-to-server integration guide

This is the contract a client website's SERVER follows to work Concierge
handoffs (list, read, close, assign, follow-up notes) inside its own
dashboard. Relay this file as-is to whoever builds the client side.

Base URL: `https://app.vivereply.com` (Concierge production).

## Setup (Concierge side, once per integration)

1. Apply the schema (additive: two tables, one column):
   `pnpm exec prisma db push` (needs `DIRECT_URL`; run outside any sandbox
   without database access), then deploy.
2. In Concierge `/admin`, mint a bridge token for the property
   (e.g. name `demo1 dashboard`, property `krishnachura-retreat`).
3. Copy the token into the CLIENT SERVER's secrets immediately — it is
   shown once and never again. Format: `cb.<prefix>.<secret>`.

## Auth

Every bridge request carries the token server-to-server:

```
Authorization: Bearer cb.<prefix>.<secret>
```

- Missing or wrong key → `401 { "error": "Invalid or missing bridge key." }`.
- A token sees ONLY its own property's handoffs. An id from another
  property returns `404`, exactly like a missing id — callers cannot probe
  across properties by watching status codes.
- Revoking in `/admin` kills the key on its next call.

## Endpoints

All responses are JSON. Timestamps are ISO strings.

### List handoffs

```
GET /api/bridge/handoffs
GET /api/bridge/handoffs?status=OPEN        # or IN_PROGRESS, CLOSED
```

→ `200` array of:

```json
{
  "id": "cm…",
  "conversationId": "cm…",
  "propertyId": "krishnachura-retreat",
  "reason": "Group booking request",
  "summary": "25 colleagues…",
  "status": "OPEN",
  "assignee": null,
  "createdAt": "2026-10-28T…",
  "noteCount": 1,
  "notes": [{ "id": "cm…", "author": "Rafi", "body": "Called back…", "createdAt": "…" }]
}
```

Unknown `?status=` → `400`. Newest first.

### Read one handoff (with transcript)

```
GET /api/bridge/handoffs/<id>
```

→ `200` the record as above, plus:

```json
"transcript": [{ "role": "user", "content": "…", "createdAt": "…" }]
```

Unknown id (or another property's) → `404 { "error": "Handoff not found." }`.

### Modify (assign, move, close)

```
PATCH /api/bridge/handoffs/<id>
Content-Type: application/json

{ "status": "IN_PROGRESS", "assignee": "Rafi" }
```

- `status`: one of `OPEN`, `IN_PROGRESS`, `CLOSED`. Closing is
  `{ "status": "CLOSED" }`.
- `assignee`: staff name ≤ 100 chars, or `null` to clear.
- Send at least one field; anything else → `400`.
- → `200` the full record (same shape as GET one).

### Add a follow-up note

```
POST /api/bridge/handoffs/<id>/notes
Content-Type: application/json

{ "author": "Rafi", "body": "Guest confirmed 20 rooms by phone." }
```

- `author` required, ≤ 100 chars. `body` required, ≤ 2000 chars.
- → `201 { "id", "handoffId", "author", "body", "createdAt" }`.

## Client-side example (Node, server only)

```js
const BRIDGE_BASE = "https://app.vivereply.com";
const BRIDGE_KEY = process.env.CONCIERGE_BRIDGE_KEY; // server secret, never in the browser

async function bridge(path, init = {}) {
  const res = await fetch(`${BRIDGE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${BRIDGE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Bridge responded ${res.status}`);
  return data;
}

const open = await bridge("/api/bridge/handoffs?status=OPEN");
await bridge(`/api/bridge/handoffs/${open[0].id}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "IN_PROGRESS", assignee: "Rafi" }),
});
```

## Security rules (non-negotiable)

1. The bridge key lives ONLY in the client server's secrets. It must never
   appear in browser code, logs, error messages, or the repo.
2. The Concierge stores the key's hash, not the key — a database read
   cannot call the API.
3. Every request re-checks the token row and the property scope: revoke is
   instant, and cross-property reads are impossible, not just forbidden.
4. Honest limits: no rate limiting yet, no IP allowlist. If a key leaks,
   revoke it in `/admin` and mint a new one — do not keep using it.

## Testing the integration

```bash
KEY='cb.<prefix>.<secret>'  # from /admin mint; export, never paste into chat logs
curl -s "$BASE/api/bridge/handoffs?status=OPEN" -H "Authorization: Bearer $KEY"
curl -s -X PATCH "$BASE/api/bridge/handoffs/<id>" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' -d '{"status":"IN_PROGRESS","assignee":"Rafi"}'
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/bridge/handoffs"  # no key -> 401
```

With `BASE=https://app.vivereply.com` after deploy. Key owner: whoever
mints in `/admin` runs these — the secret must not travel over chat.
