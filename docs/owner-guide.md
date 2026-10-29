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

In **Settings → Booking system connection**:

1. Paste your Suite base URL + key, press **Test** — proceed only
   on green. Your key encrypts immediately; we never show it again.
2. In **Room catalogues**, add every room the chatbot may sell with
   live prices. No row, no quote — the bot never invents rooms.

No booking system yet? Tell us — the chat still answers questions
and takes handoffs while you sort that out.

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

## When something looks wrong

- Chat answers "I don't know" on documented facts → your knowledge
  run missed it; re-check uploads, ask us for a re-run.
- Quotes fail or drafts error → Settings → booking connection →
  Test. Red means your Suite or key needs attention.
- Widget missing on your site → the host isn't in Domains (step 4.1).
- Anything else → email us with your resort name, what you clicked,
  and what you saw. Screenshots beat descriptions.
