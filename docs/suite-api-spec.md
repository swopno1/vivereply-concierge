# Suite API spec v1 — contract for pluggable resort backends

Any booking backend that implements this contract plugs into Vivereply
Concierge through configuration alone (Settings → Suite connections: base
URL + optional key + room mapping). No Concierge code changes per resort.

Conventions: JSON everywhere. Dates are `YYYY-MM-DD` (check-out exclusive).
Money is integer **poisha** (1 taka = 100 poisha), never floats. Times are
ISO strings. The Concierge sends `X-Concierge-Suite-Version: 1` on every
call and, when the binding stores a secret, `Authorization: Bearer <secret>`
(backends that need no key ignore the header). Timeout: 15s per call.

## 1. Ping (REQUIRED)

```
GET /api/concierge/ping
→ 200 { "ok": true, "suiteVersion": 1 }
```

Powers Test connection without touching data. A backend without this endpoint
is reachable but not fully v1-compliant (the Concierge reports that honestly).

## 2. Availability (REQUIRED)

```
GET /api/rooms/<roomId>/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
→ 200 { "roomId": "<id>", "checkIn": "<date>", "checkOut": "<date>",
        "available": 2, "units": ["TV-3", "TV-5"] }
```

- `available`: integer count of free units for the whole stay (0 = sold out).
- `units`: optional list of free unit labels (display only, never required).
- Unknown room → `404 { "error": "not_found" }` (message text free-form).
- Invalid dates → `400 { "error": "…" }`.

## 3. Create booking hold (REQUIRED)

```
POST /api/bookings
{ "roomId": "<id>", "guestName": "…", "guestEmail": "…", "guestPhone": "…",
  "checkInDate": "YYYY-MM-DD", "checkOutDate": "YYYY-MM-DD" }
→ 200 { "success": true,
        "booking": { "id": "…", "bookingCode": "RES-…", "totalAmountPoisha": 2900000 } }
```

- Creates a PENDING hold (no payment). `bookingCode` is the guest-facing code.
- Holds auto-release 24 hours after creation if unpaid — the guest
  always sees this window (draft card + agent prompt), so backends
  MUST honor it (or negotiate a different window out-of-band before
  going live; the Concierge states 24h unless told otherwise).
- `totalAmountPoisha` is the backend's own total for the stay — it governs
  over the Concierge's quote on any mismatch, and the guest is told so.
- Missing/invalid fields → `400`. Unknown room → `404`. No free unit → `409`
  (message SHOULD read like "sold out" — the Concierge maps 409 to sold-out
  wording when the message is empty).
- Idempotency: the Concierge sends `Idempotency-Key: <conversation-id>`
  (one draft per conversation, so the key is stable across retries).
  Backends MUST return the ORIGINAL booking (same code, same total) when
  a key repeats — never a second hold. A repeated key with DIFFERENT
  booking fields SHOULD answer `422` (key reuse across conversations is
  a Concierge bug; fail loudly, don't fork the ledger).

## 4. Lookup by code (REQUIRED)

```
GET /api/bookings/lookup?code=RES-…
→ 200 { "bookingCode": "RES-…", "firstName": "Amir",
        "checkInDate": "YYYY-MM-DD", "checkOutDate": "YYYY-MM-DD",
        "status": "PENDING" }
```

- Returns ONLY these fields (minimal disclosure is a safety property: the
  Concierge shows dates + first name + status and nothing else).
- Unknown code → `404`. Field names are fixed — `checkInDate`, not `checkIn`.

## 5. Send details by contact (REQUIRED)

```
POST /api/bookings/send-details
{ "email": "…" } and/or { "phone": "…" }
→ 200 { "sent": true }
```

- If a booking exists for the contact, email its full details to the address
  already stored on the booking — NEVER to an address from the request.
- The response is IDENTICAL whether or not a booking exists (no oracle).
  Neither this endpoint nor the Concierge may reveal found/not-found.

## Errors & rate limits

- Error shape: `{ "error": "human sentence" }`. The Concierge surfaces the
  sentence when safe, else a generic line — it never invents details.
- Backends SHOULD rate-limit brute-forceable endpoints (lookup, send-details)
  with `429`; the Concierge tells the guest to try again later.
- `429` contract: status alone is the signal — the Concierge maps ANY
  `429` to try-again-later wording even with an empty body. Backends
  MAY include `{ "error": "…" }` and a `Retry-After` header (currently
  informational; the Concierge answers immediately, it does not wait).
- Anything outside this spec (extra fields, extra endpoints) is ignored.

## Versioning

Breaking changes ship as v2 under a new spec doc; v1 endpoints keep working.
The version header lets backends serve both during migration.
