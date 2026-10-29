# Submission text draft (portal fields, fill on Nov 4)

Copy-paste source for the hackathon portal. Dates and links verified
in-tree; anything marked VERIFY must be confirmed in the portal
itself. First commit Oct 27, 2026 — inside the Oct 26 – Nov 4
window (state this exactly; judges check commit history).

## Title

Vivereply Concierge — AI front-of-house for resorts

## Tagline

A chat that checks live availability, quotes exact prices, holds
booking drafts with real codes, takes payment links to the guest, and
hands complex cases to staff — one product, many resorts.

## Track / theme

Startup track, "Build for Your World". [VERIFY in portal: exact track
name and theme spelling on submission day.]

## Description (paste)

Independent resorts with no night front desk lose after-hours guest
enquiries — and a wrong answer (wrong price, invented availability)
is worse than silence. Vivereply Concierge is a multi-tenant AI
front-of-house: each resort gets its own rooms, booking backend,
knowledge, voice, staff scope, and logins.

On the live demo (Krishnachura Retreat, Himchari, Cox's Bazar), a
guest chats on the resort website: the agent checks LIVE availability,
quotes exact prices from catalogue rates, holds a real booking draft
with a code (PENDING hold, Suite total governs), presses for payment
through a server-minted /pay link the model cannot invent, verifies
bookings privately (dates + first name + status only; email/phone
lookups get one generic reply), answers in Bengali or English, and
hands the impossible to staff with the full conversation on a triage
board.

Muse Spark (muse-spark-1.3 via the Meta Model API) is the
decision-maker: every turn runs a hand-rolled tool-use loop (max 6
rounds) over room-scoped tools built per request from the property's
own catalogue. Token usage per backend is logged on every call; one
Baseten-hosted fallback attempt covers primary outages. RAG is
supporting-only (threshold 0.45, top-4, silence over guessing) —
never the product.

Built during the hackathon: multi-tenant chat, agent tools,
quote/rate layer, staff board + bridge + widget, settings,
onboarding/RAG, public signup with verification, booking payments.
Pre-existing: Vivereply Suite and the demo1 resort site.

## Links

- Live app: https://app.vivereply.com
- Demo resort (widget): https://demo1.vivereply.com
- Repo: [VERIFY: final public URL + tag on submission day]
- Demo video: [upload Nov 3, paste URL + confirm captions]

## Demo video spec

[VERIFY in portal: max length, max size, captions requirement. Film
per docs/demo-script.md; export per docs/video-export-preset.md.]

## Contributors

Solo founder. [VERIFY: contributor entry in portal.]

## Rules + eligibility

[VERIFY: rules accepted in portal; confirm weights 30/25/25/20 if
shown; confirm video caps; new-work-only holds (first commit Oct 27).]
