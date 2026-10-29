# Submission impact narrative — DRAFT (2026-10-29, rev 2)

One page. Every claim below pins to evidence in brackets; anything
without a pin is not claimed. No customers, revenue, conversion rates,
percentages, or testimonials exist yet — none are stated or implied.
Built during the hackathon window (first commit Oct 27, 2026).

## Problem (one line)

Independent resorts with no night front desk lose guest enquiries that
arrive after hours — and a wrong answer (wrong price, invented
availability) is worse than no answer, because it creates overbooking
and disputes.

## Who benefits

- The resort: after-hours enquiries become held drafts with booking
  codes, waiting in its admin for morning confirmation.
- The guest: answered at night, in Bengali or English, with real prices
  from live data — never brochure guesses.
- The staff: a morning triage board — drafts and handoffs with full
  context, assignable, notable, resolvable — instead of missed calls.

## The proven chain (the demo IS the evidence)

On the live demo property, Krishnachura Retreat (Himchari, Cox's Bazar),
a guest on the resort website [widget on https://demo1.vivereply.com]
chats with the Concierge [https://app.vivereply.com]:

1. Asks for a room and dates → the agent checks LIVE availability and
   returns an exact quote (e.g. Bamboo Cottage Dec 1–3 2026 → ৳17,000
   quote card, 2 × ৳8,500).
2. Confirms with name + contact → a real draft is held:
   RES-202610-00004, totals match, status PENDING [visible in the
   resort's /admin]. An earlier draft, RES-202610-00001 (Terracotta
   Villa, unit TV-5, Oct 28–29, ৳14,500), proved the same loop.
3. Asks in Bengali → the same dated total in Bengali digits (৳১৭,০০০).
4. Quotes the code later → the chat shows stay dates + first name +
   status and NOTHING else. Asks by email/phone → one generic reply
   whether or not a booking exists; details go only to the email
   already on the booking.
5. Asks the impossible (25-person wedding) → the agent refuses to
   invent a rate and hands the full summary to staff [/staff triage
   board: assign, note, resolve].
6. Holds a draft → the agent presses for payment in the same reply
   and mints a server-side /pay link (Stripe card or manual
   transfer); the guest pays standalone, webhook/staff confirmation
   flips the row to paid, and "is it paid?" re-reads the row.
   [BUILT, trial pending — presented as built, not as live, until
   the docs/payments.md trial passes. The bot never takes payment
   itself and never invents a payment URL.]

Worked example with REAL prices only: a held Terracotta Villa draft
for 2 weeknights = ৳14,500 × 2 = ৳29,000 of booking value that an
unanswered enquiry would have lost. Stated as booking value held —
never profit or ROI; pricing is undecided.

## Moat (why not a weekend chatbot)

The chat UI anyone can copy. What they cannot copy in a weekend: the
Suite integration (live availability, unit assignment, real booking
codes, PENDING holds), the no-invent guard system (quote-first, one
draft per conversation, Suite total governs over the quote), the
payment insistence (booking-bound deep links the model cannot invent,
server-side money, fraud-safety copy in every surface), the
privacy-safe verification design, and Bengali support with exact
totals. The product is a front desk on live data, not a prompt over
a knowledge base.

## What's next (pilot, not promises)

Demo-proven, pilot-pending: the next step is a pilot with independent
resorts under docs/pilot-plan.md — success criteria, a kill rule
(unexplained trust incident unfixed in 48h pauses the resort), and a
before-period baseline captured at onboarding (phone logs, messages).
Staff reply-into-chat and alerts are the first product additions —
today the solution saves the guest's night; the pilot must also save
the staff's morning.

## What we do NOT claim

No customer counts, no revenue, no conversion rates, no "X% more
bookings", no testimonials. Payments are built and trial-pending, not
live (a draft is a hold until the paid row says otherwise). No
WhatsApp channel, no change/cancel flow, no multi-property production
— one live property. Anything listed here as missing is roadmap, not
hidden fine print.
