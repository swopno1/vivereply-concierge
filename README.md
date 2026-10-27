# Vivereply Concierge

AI front-of-house for resorts — a demo chat that checks live availability,
quotes exact prices, holds booking drafts, answers property questions from
seeded knowledge, and hands complex cases to staff with the full
conversation.

Built for the **Meta Global AI Developer Hackathon** (Startup track,
"Build for Your World"). Pre-existing: Vivereply Suite and the demo1
resort site. Built during the hackathon (Oct 26 – Nov 4, 2026): this
Concierge service — chat, agent tools, quote/rate layer, staff view,
cards, and RAG grounding. The demo property is fictional, not a real
resort.

## What it does

- **Chat** (`/`) — bilingual English/Bengali. Language follows the
  guest's latest real language; the taka sign (৳) alone never flips it.
- **Agent tools, via Muse Spark on the Meta Model API** — the model
  acts, it doesn't just answer:
  - `check_availability` — live units from the Suite API
  - `get_quote` — exact quote from catalogue prices + rate rules
  - `create_booking_draft` — holds a room (PENDING, no payment), only
    after the guest confirms the quote and gives name, email, phone
  - `request_handoff` — passes the conversation to staff with a summary
- **Cards** — quote, draft (with booking code, plus a "Suite total
  governs" warning if it ever differs from the quote), and handoff
  cards, built only from that turn's tool logs.
- **Staff view** (`/staff`) — every handoff, newest first, with the
  full transcript. Demo only in v1: no login protects this page.
- **RAG grounding (supporting only)** — property questions (check-in
  times, food, packages, location) are answered from seeded demo
  knowledge via pgvector + Gemini embeddings, similarity ≥ 0.45, top 4.
  Below threshold the agent says it does not know and offers a
  handoff. Room prices and availability never come from RAG — the
  Suite tools govern those.

## Honesty rules (non-negotiable)

Never invent a room, price, availability, booking, or property fact.
A quote is shown before any draft; one draft per conversation; the
Suite total governs on any mismatch; anything unknown goes to staff.

## Stack

Next.js (App Router) + TypeScript + Tailwind. Supabase Postgres +
Prisma 7 + pgvector, the Concierge's own database — it never shares
the Suite database, it talks to Suite over HTTP only. Answering model:
Muse Spark via the Meta Model API. Embeddings only: Gemini
gemini-embedding-001 at 768 dimensions via outputDimensionality
(the Meta API lists no embedding model).

## Setup

```bash
cp .env.example .env.local   # then fill it in; never commit .env*
pnpm install
```

Environment (see `.env.example` for the full list):

- `META_API_KEY` — Meta Model API key (starts `LLM_`)
- `SUITE_API_BASE_URL` — demo Suite deployment (demo1)
- `DATABASE_URL` — Supabase transaction pooler (port 6543, runtime)
- `DIRECT_URL` — Supabase session pooler (port 5432, migrations)
- `GEMINI_API_KEY` — Google AI Studio, embeddings only

Then, in order:

```bash
# 1. Enable pgvector in the Concierge Supabase project:
#    Dashboard → SQL Editor → CREATE EXTENSION IF NOT EXISTS vector;
pnpm exec prisma generate
pnpm exec prisma db push   # uses DIRECT_URL via prisma.config.ts
pnpm exec tsx prisma/seed-knowledge.ts   # embeds the 5 demo docs
pnpm dev                   # http://localhost:3000, staff at /staff
```

Standalone scripts (like the seeder) must import `lib/env` first,
before `lib/prisma` — `tsx` does not load `.env` files by itself, and
the Prisma Pool is created at import time.

## Widget (embed on any site)

```html
<script src="https://<your-concierge-host>/widget.js" data-key="demo-krishnachura"></script>
```

That one script tag adds a floating Chat button and an iframe panel
loading `/widget?key=demo-krishnachura` from the Concierge host — the
same chat as `/`, in compact mode. The script derives its origin from
its own `src`, so it works on localhost and on a deployment with no
code change. The key is a public label, not a secret: an unknown key
shows a "not configured" panel, never a guessed property, and in v1
it labels the conversation without switching catalogue, Suite URL, or
database (single demo property).

## Security (step 4.5)

Three pieces, kept simple for the hackathon window:

- **Admin login (`/login`)**: single admin, password only, from the
  `ADMIN_PASSWORD` env var. A signed HttpOnly session cookie protects
  `/staff` and `/admin`. No signup, no user table, no 2FA in v1 —
  recovery is changing the env var.
- **Approved domains (`/admin`)**: only hosts listed there (and still
  active) can embed the widget for a property. demo1.vivereply.com is
  seeded for the demo property. Deactivating a domain stops its widget
  on the next chat message.
- **Widget token handshake**: `widget.js` asks `/api/widget-token`
  from the host page, and the browser attaches the host page's Origin.
  Only an approved origin gets a short-lived signed token, and
  `/api/chat` verifies that token — and re-checks domain approval —
  on every message. The token's propertyId governs; a propertyId sent
  by the browser is ignored. `/` issues a direct token server-side
  and needs no approved domain.

Honest limits: this stops unauthorized embedding and unauthorized
staff/admin access, not a determined attacker forging headers with
curl (in a real browser the Origin header cannot be faked by the
embedding site). There is no rate limiting in v1, and localhost is
approved automatically in development only. Post-hackathon upgrades:
multi-user admin, 2FA, audit log, rate limiting, per-domain
frame-ancestors headers.

## Demo flow to try

1. Sea-facing room, 2 nights, ~৳15,000/night → quote card, then
   confirm + details → draft card with booking code.
2. Bengali cottage conversation + halal-food question → grounded
   Bengali answer.
3. 25-person group rate → no invented rate, handoff card, and the
   case appears at `/staff` with the transcript.
