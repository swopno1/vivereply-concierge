# Owner guide (for resort owners, not developers)

Your AI front desk in one sitting: sign up, teach it your resort,
connect bookings, paste one snippet. No code until the last step,
and then it's copy-paste.

## 1. Create your account (5 min)

1. Open the Concierge app and choose **Sign up**.
2. Enter your resort name, your work email, and a password.
3. Check your inbox for the verification link and click it —
   configuration stays locked until you do (that's deliberate).

## 2. Teach it your resort (15–30 min)

Open **Onboarding** and fill the business form: address, phone,
assistant name, languages, tone, greeting. Then give it knowledge:

- **Website**: paste your site address — it reads the public pages.
- **Documents**: upload your rate card, policies, menus (PDF, Word,
  Excel, text). Whatever you upload is what it can answer from.

Press submit and watch the run card turn `complete`. Ask it a
question only your documents answer — if it answers, the knowledge
landed. One run per resort; extra runs need our approval (ask us).

## 3. Connect your booking system (10 min)

In **Settings → Booking system**:

1. Paste your Suite base URL + key, press **Test** — proceed only
   on green. Your key encrypts immediately; we never show it again.
2. In **Room catalogues**, add every room the chatbot may sell with
   live prices. No row, no quote — the bot never invents rooms.

No booking system yet? The chat still answers questions from your knowledge base and takes handoffs while you sort that out — it just can't check prices or availability or take booking drafts until you connect one.

## 4. Put it on your website (10 min, your webmaster can do it)

1. In **Settings → Domains**, add each host where the chat may
   appear (e.g. `www.yourresort.com`). Unknown sites get nothing.
2. In **Chat widget codes**, copy your one script tag and paste it
   before `</body>` on every page. Done — a Chat button appears.
3. **Staff view** (optional): mint a bridge key in Settings, keep it
   on YOUR server (never in page source), and embed the staff
   widget per the snippet shown there.

## 5. Day to day

- **Handoffs** land in **Staff** (or your embedded widget): read the
  transcript, add notes, assign, resolve. Reply to the guest by
  phone/email for now — staff reply-into-chat is coming.
- **Payments** (if enabled for you): the bot presses every held
  draft toward your payment page and mints the link itself. Card
  payments confirm automatically; manual transfers wait for your
  **Confirm received** click in **Booking payments** (check the
  transaction ID first — the guest gets a receipt email).
- **Holds release after 24 hours unpaid** — the bot and the draft
  card both say so. Nothing to configure.
- **Password**: change it in Settings any time; changing signs out
  every other session.
- **Two-factor authentication**: strongly recommended — see below.

## Protect your account: two-factor authentication (2 min)

With this on, logging in takes two steps: your password, then a
6-digit code from an authenticator app on your phone (Google
Authenticator, Authy, or similar — free). Even if someone learns
your password, they can't get in without your phone.

**Turn it on** (in **Settings → Profile → Two-factor authentication**):

1. Press **Enable two-factor authentication**. A square QR code
   appears on screen.
2. Open your authenticator app, choose "add account" / the **+**,
   and point your phone camera at the square. The account appears
   in the app instantly. (Can't scan? Choose "enter a key
   manually" in the app and type the long key shown under the
   square instead.)
3. Type the 6-digit code the app now shows into the page and press
   **Confirm and enable**.
4. **Save your recovery codes NOW.** Ten codes appear exactly once
   — print them or store them somewhere safe (not on the phone
   with the app). Each code works one time, and they are never
   shown again. Press **I've saved these codes** when done.

**Logging in afterwards:** enter your email and password as usual,
then the current 6-digit code when asked. Lost your phone? Choose
"Use a recovery code" on that screen and enter one saved code.

**Turn it off:** Settings → Profile → Two-factor authentication →
**Disable**, then your current password plus a current code (or
one recovery code). Disabling deletes the stored secret and all
recovery codes.

If you lose your phone AND your recovery codes together, email us
from your account address — getting back in then needs our manual
help and identity checks, so keep those codes safe.

## Trial, billing & usage (read once)

**Free trial.** Every resort starts with a 30-day free trial — no
card needed, full features. We'll email you reminders on days 7,
21, 27, and 30, and a banner counts down inside the app from day
21. If the trial ends without a subscription, guest chat pauses
with a polite "temporarily unavailable" message (your phone/email
show so guests can still reach you). Your settings and data stay
put for 90 days, and subscribing resumes everything immediately —
nothing is ever deleted for non-payment.

**Subscribe.** Open **Billing** in the sidebar, pick a plan (Starter,
Growth, or Scale — each allows a monthly number of guest
conversations, shown on the page) and monthly or annual billing,
then press **Subscribe**. Payment runs on Stripe's own secure page
— your card details never touch our servers. Scale covers up to 3
properties under one owner — ask us and we'll provision the 2nd and
3rd for you.

**Usage.** The billing page shows conversations handled this month
against your plan's limit (one conversation = one guest chat
thread). At 80% we email you; past 120% guest chat pauses until
next month. (Overage past the limit is coming later — for now the
pause always applies.)

**Change or cancel.** Change plans any time from the billing page
(the difference is prorated automatically). Cancel keeps everything
running to the end of the paid period, then guest chat pauses like
an ended trial — resubscribe any time to resume.

**Failed payments.** If a payment fails, guest chat keeps running
while Stripe retries — we'll email you so we can sort it out
together before anything pauses.

## When something looks wrong

- Chat answers "I don't know" on documented facts → your knowledge
  run missed it; re-check uploads, ask us for a re-run.
- Quotes fail or drafts error → Settings → Booking system →
  Test. Red means your Suite or key needs attention.
- Widget missing on your site → the host isn't in Domains (step 4.1).
- Anything else → email us with your resort name, what you clicked,
  and what you saw. Screenshots beat descriptions.
