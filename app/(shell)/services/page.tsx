// My Services (D1): the client's ViveReply services — Chatbot plan card
// from the billing snapshot, Suite mirror of the Home card state, and a
// RoomReady coming-soon card. No prices anywhere on this page.

import { redirect } from "next/navigation";
import { getSession, resolvePropertyId } from "@/lib/tenant";
import { getHomeData } from "@/lib/dashboard";

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/services");
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const data = await getHomeData(propertyId);
  if (!data) redirect("/settings");
  const snap = data.snapshot;
  const statusLine = !snap.gate.allowed
    ? "Paused"
    : snap.status === "TRIAL"
      ? `Trial · ${snap.trialDaysLeft} day${snap.trialDaysLeft === 1 ? "" : "s"} left`
      : "Active";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Services</h1>
        <p className="text-sm text-gray-600">Everything {data.propertyName} runs on ViveReply.</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" aria-label="Chatbot service">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Chatbot</p>
        <p className="mt-1 text-lg font-bold text-gray-900">
          {snap.hasSubscription ? `${snap.tier} plan` : "No billing record"} · {statusLine}
        </p>
        {(snap.trialEndsAt || snap.currentPeriodEnd) && (
          <p className="mt-1 text-sm text-gray-600">
            {snap.status === "TRIAL"
              ? `Trial ends ${fmtDate(snap.trialEndsAt)}`
              : `Renews ${fmtDate(snap.currentPeriodEnd)}`}
            .
          </p>
        )}
        <a href="/billing" className="mt-2 inline-block text-sm font-medium text-gray-900 underline underline-offset-2">
          Manage billing
        </a>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" aria-label="Suite service">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Suite</p>
        {data.binding ? (
          <>
            <p className="mt-1 text-lg font-bold text-gray-900">Connected</p>
            <p className="mt-1 truncate text-sm text-gray-600">
              {hostOf(data.binding.suiteBaseUrl) ?? data.binding.suiteBaseUrl}
            </p>
            <a
              href={data.binding.suiteBaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-gray-900 underline underline-offset-2"
            >
              Open my Suite
            </a>
          </>
        ) : (
          <>
            <p className="mt-1 text-lg font-bold text-gray-900">Not connected</p>
            <p className="mt-1 text-sm text-gray-600">Run your front desk on the Suite — talk to us to get set up.</p>
            <a
              href="https://wa.me/8801819062270"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-gray-900 underline underline-offset-2"
            >
              Talk to us on WhatsApp
            </a>
          </>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" aria-label="RoomReady service">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">RoomReady</p>
        <p className="mt-1 text-lg font-bold text-gray-900">Coming soon</p>
      </section>
    </main>
  );
}
