# Demo script — Vivereply Concierge hackathon video (DRAFT, uncommitted working file)

Filming surface: the widget on https://demo1.vivereply.com (the story is "a guest
chats on the resort's website"). Admin proofs in separate tabs: demo1 /admin
(drafts), app /staff (handoffs). Rule: film with proven dates only — re-probe the
exact windows below the morning of filming (Suite seed changed once already; assume
it can change again). If a live check differs on camera, use the fallback line —
never fake the result in editing. Caption everything, and narrate key visuals
aloud (lines marked AD) so the video stands alone as audio.

## Candidate windows (re-probe morning-of; quotes consume nothing, drafts consume one unit)

| Beat | Room | Window | Expected total | Status 2026-10-28 |
|---|---|---|---|---|
| 1 draft | Terracotta Villa | Nov 10–12 (alt: Nov 20–22, Nov 27–29) | ৳29,000 (2 × ৳14,500) | 1 free (pre-reseed read; MUST re-probe) |
| 5 Bengali | Bamboo Cottage | Nov 4–6 (alt: Nov 12–14) | ৳17,000 (2 × ৳8,500) | 1 free, quoted live |

Do NOT film Oct 28–31 (fully held by RES-202610-00001/-00002).

## Beat 0 — opening line (exact, verbatim)

"ViveReply Suite and the demo resort site already existed. What we built during
this hackathon, October 26 to November 4, is Vivereply Concierge — the AI
front-of-house you are about to see."

## Beat 1 — availability + exact quote + draft + admin proof

1. Type: "Is the Terracotta Villa available from November 10 to November 12? What is the total for 2 nights?"
   Expect: Thinking → Checking availability → quote ৳29,000 + quote card.
   Fallback (sold out on camera): "That window just filled — that is live data, not
   a recording. Let me try the backup window." → use alt window.
2. Type: "Yes, hold it. [name], [email], [phone]."
   Expect: draft card with NEW booking code, suiteTotal = quotedTotal.
   AD: "The quote card shows Terracotta Villa, November 10 to 12, total
   ৳29,000 — then the draft card shows the booking code."
3. Cut to demo1 /admin: show the code, Terracotta, dates, PENDING.
   AD: "In the resort's own admin: the same code, Terracotta Villa, PENDING."
   Fallback (admin slow): narrate "the draft lands in the resort's own admin" over
   the draft card; show /admin in a pickup shot, same code, no edits to the chat take.

## Beat 2 — tenant isolation (only if proven in the pre-filming check below)

Pre-filming check (founder, 2 min, do BEFORE the shoot, not on camera): in app
/admin, deactivate demo1.vivereply.com → send one widget message → expect
"This site is no longer approved to host this chat." → REACTIVATE immediately →
send one message → expect a normal reply.
On camera: show the deactivation error from the check (screen recording), then the
live reactivated widget answering normally. Fallback: cut the beat entirely —
a missing beat scores better than a staged one.

## Beat 3 — group handoff lands in /staff

1. Type (fresh chat): "We are 25 colleagues coming for a retreat. What group rate can you give us?"
   Expect: no invented rate, handoff card.
   AD: "No invented rate — a handoff card instead."
2. Cut to app /staff: show the record + full transcript.
   AD: "In /staff, the same handoff with the full transcript."
   Fallback (model answers instead of handing off): follow up "I need a person to
   arrange this." → handoff. If it still answers, cut the beat.

## Beat 4 — privacy-safe verification (uses the code from Beat 1)

1. Type (fresh chat): "I have a booking code [CODE]. Can you check it?"
   Expect: first name + dates + PENDING only. Narrate: "dates, first name, status —
   nothing else; the server strips the rest."
   AD: "The reply shows the first name, the dates, and the status only —
   no contact details anywhere on screen."
2. Type (fresh chat): "Send my booking details to [real email on the booking]."
   Expect: the generic reply, no details, no found/not-found signal.
3. Narrate: "the same reply for a real and a nonexistent contact; details go only
   to the email already on the booking." Do NOT open the inbox on camera.

## Beat 5 — one Bengali exchange

Type: "আসসালামু আলাইকুম। ব্যাম্বু কটেজ ৪ নভেম্বর থেকে ৬ নভেম্বর ২০২৬ পর্যন্ত খালি
আছে কি? ২ রাতের মোট কত হবে?"
Expect: Bengali reply, ৳17,000 (৳8,500 × 2) + quote card. Quote only — do NOT draft
(don't consume the Bamboo unit on camera).
AD: "The Bengali reply and the quote card show ৳17,000 for two nights."
Fallback (sold out): narrate over the honest sold-out reply: "live data — and it
answers in Bengali either way." Then cut; the dated-total claim needs the quote take.

## Pre-filming checklist (day of)

- [ ] Re-probe Beat 1 + Beat 5 windows; confirm ≥1 free.
- [ ] Beat 2 check done + domain reactivated; widget answers normally.
- [ ] Fresh browser profile, widget opens, captions on.
- [ ] Never claim: seasonal rates, multi-property, customers, accuracy figures.
