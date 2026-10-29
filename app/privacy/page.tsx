// Guest privacy notice (booking + chat data). Bare page, no shell —
// linked from the chat footer and the payment page, readable with no
// login. Plain statements only: what is collected, who processes it,
// how long it stays, and how to ask for deletion. It promises nothing
// the product cannot do (there is no self-serve deletion UI — the
// resort handles requests).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy notice — Vivereply Concierge",
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-5 px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900">Privacy notice</h1>
      <p className="text-sm text-gray-600">
        This notice covers the Vivereply Concierge chat and booking payment pages, run for the
        resort whose website you came from. That resort is responsible for your data; Vivereply
        processes it only to run this service for them.
      </p>

      <Block title="What is collected">
        <ul className="list-disc pl-5">
          <li>Your chat messages and the replies, kept as a conversation the resort's staff can read when you ask for a person or the chat is handed over.</li>
          <li>
            If you hold a booking: your name, email, and phone number, plus the stay details and
            booking code.
          </li>
          <li>If you pay by card: the payment is processed by Stripe — card details go to Stripe only, never to this chat or the resort's staff.</li>
          <li>Whether a chat was rated helpful or not, to help the resort improve.</li>
        </ul>
      </Block>

      <Block title="Who processes it">
        <p>
          The answering model (Muse Spark via Meta; Baseten-hosted Muse Spark Open if the primary
          is down), Google (embeddings only), Supabase and Vercel (hosting and database), Resend
          (booking and receipt emails), and Stripe (card payments). Staff of the resort see
          conversations handed to them and bookings made through the chat.
        </p>
      </Block>

      <Block title="How long it stays">
        <p>
          Conversations and bookings stay stored so the resort can serve your stay and follow up.
          Ask the resort directly to delete your conversation or booking details and they will
          arrange it.
        </p>
      </Block>

      <Block title="Staying safe">
        <ul className="list-disc pl-5">
          <li>Pay only through the payment link the chatbot gave you, on an address you recognise.</li>
          <li>Staff never ask for card details, PINs, or one-time codes — in chat or anywhere else.</li>
          <li>Booking details are never shown in chat from a phone number or email alone; they go to the email already on the booking.</li>
        </ul>
      </Block>
    </main>
  );
}
