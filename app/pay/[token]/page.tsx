// Guest payment page (booking payments). Standalone deep link — works
// with no chat session: /pay/[token]?booking=[code].
//
// Every refusal shares ONE generic face (invalid token, wrong booking
// code, expired link, flag off, fixture property): the page never says
// which check failed, so tokens can't be probed. What IS shown is
// deliberately thin: booking code, first name, room, dates, amount —
// never email, phone, or full name.

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatTaka } from "@/demo-config/rates";
import {
  getLinkByToken,
  manualInstructions,
  paymentsEnabledGlobal,
  propertyTakesPayments,
} from "@/lib/payments";
import PayButton from "./PayButton";

export const metadata: Metadata = {
  title: "Secure booking payment",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-5 px-4 py-10">
      {children}
    </main>
  );
}

function GenericRefusal() {
  return (
    <Shell>
      <h1 className="text-2xl font-bold text-gray-900">This payment link isn&apos;t usable.</h1>
      <p className="text-base text-gray-700">
        It may have expired, already been paid, or the address may be incomplete. Booking holds
        release after 24 hours unpaid — ask the chatbot for a fresh payment link, or contact the
        resort directly.
      </p>
      <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">
        Safety: only ever pay through a link the resort&apos;s own chatbot gave you, on an address
        you recognise. The resort never asks for card details, codes, or one-time passwords in
        chat, by phone, or by email.
      </p>
    </Shell>
  );
}

function SafetyPanel() {
  return (
    <section className="rounded-lg bg-gray-100 px-4 py-3">
      <h2 className="text-sm font-semibold text-gray-900">Paying safely</h2>
      <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
        <li>Check this page&apos;s address matches the resort&apos;s official site before paying.</li>
        <li>Card details are entered on Stripe&apos;s secure page only — never here, never in chat.</li>
        <li>Staff never ask for card numbers, PINs, or one-time codes anywhere.</li>
        <li>If anyone pressures you to pay a different way, stop and call the resort.</li>
      </ul>
    </section>
  );
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ booking?: string; paid?: string; canceled?: string }>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const link = paymentsEnabledGlobal() ? await getLinkByToken(token).catch(() => null) : null;
  // Guard-rail: the booking code in the URL must be the link's booking.
  // A swapped, truncated, or guessed code fails exactly like a bad token.
  const bound =
    link !== null &&
    typeof query.booking === "string" &&
    query.booking === link.bookingCode &&
    propertyTakesPayments(link.propertyId);
  if (!bound || !link) {
    return <GenericRefusal />;
  }

  const property = await prisma.property.findUnique({ where: { id: link.propertyId } }).catch(() => null);
  const amount = formatTaka(link.amountPoisha);
  const resortName = property?.name ?? "the resort";

  if (link.status === "paid") {
    return (
      <Shell>
        <p className="text-sm text-gray-600">{resortName} · secure payment</p>
        <h1 className="text-2xl font-bold text-gray-900">Payment confirmed — {amount}</h1>
        <dl className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-base shadow-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Booking</dt>
            <dd className="font-mono font-semibold text-gray-900">{link.bookingCode}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Guest</dt>
            <dd className="text-gray-900">{link.guestFirstName ?? "Guest"}</dd>
          </div>
          {link.room && (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Room</dt>
              <dd className="text-gray-900">{link.room}</dd>
            </div>
          )}
          {link.checkIn && link.checkOut && (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Stay</dt>
              <dd className="text-gray-900">
                {link.checkIn} → {link.checkOut}
              </dd>
            </div>
          )}
          {link.paidAt && (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Paid</dt>
              <dd className="text-gray-900">{link.paidAt.toLocaleString()}</dd>
            </div>
          )}
        </dl>
        <p className="text-base text-gray-700">
          Your room is secured — no further action needed. A receipt went to your email. You can
          ask the chatbot anytime to confirm this payment.
        </p>
        <SafetyPanel />
      </Shell>
    );
  }

  if (link.status !== "pending") {
    return <GenericRefusal />;
  }

  const justPaid = query.paid === "1";
  const justCanceled = query.canceled === "1";

  return (
    <Shell>
      <p className="text-sm text-gray-600">{resortName} · secure payment</p>
      <h1 className="text-2xl font-bold text-gray-900">
        Hi {link.guestFirstName ?? "there"} — {amount} secures your booking
      </h1>
      {justPaid && (
        <p role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          If you just paid, your confirmation is on its way — wait a moment and refresh this page.
          Otherwise complete the payment below.
        </p>
      )}
      {justCanceled && (
        <p role="status" className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">
          That payment was canceled — nothing was charged. This link stays valid until{" "}
          {link.expiresAt.toLocaleString()}.
        </p>
      )}
      <dl className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-base shadow-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-600">Booking</dt>
          <dd className="font-mono font-semibold text-gray-900">{link.bookingCode}</dd>
        </div>
        {link.room && (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Room</dt>
            <dd className="text-gray-900">{link.room}</dd>
          </div>
        )}
        {link.checkIn && link.checkOut && (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Stay</dt>
            <dd className="text-gray-900">
              {link.checkIn} → {link.checkOut}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-gray-600">Amount due</dt>
          <dd className="text-lg font-bold text-gray-900">{amount}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-600">Pay before</dt>
          <dd className="text-gray-900">{link.expiresAt.toLocaleString()}</dd>
        </div>
      </dl>

      {link.method === "stripe" ? (
        <div className="flex flex-col gap-2">
          <PayButton token={link.token} />
          <p className="text-sm text-gray-600">
            Card payment (Visa, Mastercard, Amex) processed securely by Stripe. You&apos;ll return
            here for your confirmation.
          </p>
        </div>
      ) : (
        <section className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Manual transfer</h2>
          <p className="text-sm text-gray-700">{manualInstructions()}</p>
          <p className="text-sm text-gray-700">
            Your reference: <span className="font-mono font-semibold">{link.bookingCode}</span>
          </p>
          <p className="text-sm text-gray-600">
            After transferring, tell the resort your transaction ID (reply in chat or call). Staff
            verify every manual payment before marking it paid — this page will then show your
            confirmation.
          </p>
        </section>
      )}

      <SafetyPanel />
    </Shell>
  );
}
