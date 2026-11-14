// Chatbot → Usage (D1): quota meter for the current period from the
// billing snapshot — the same numbers the billing page shows.

import { redirect } from "next/navigation";
import { getSession, resolvePropertyId } from "@/lib/tenant";
import { getBillingSnapshot } from "@/lib/billing";
import { getChatbotData } from "@/lib/dashboard";
import ChatbotSubnav from "../ChatbotSubnav";

export default async function ChatbotUsagePage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/chatbot/usage");
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const [snapshot, data] = await Promise.all([
    getBillingSnapshot(propertyId, new Date()).catch(() => null),
    getChatbotData(propertyId),
  ]);
  if (!data) redirect("/settings");
  const pct =
    snapshot && snapshot.quotaThisMonth > 0
      ? Math.min(100, Math.round((snapshot.usageThisMonth / snapshot.quotaThisMonth) * 100))
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Usage</h1>
        <p className="text-sm text-gray-500">Conversation quota for {data.propertyName}, this calendar month.</p>
      </header>
      <ChatbotSubnav />

      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        {snapshot ? (
          <>
            <p className="text-sm font-semibold text-gray-900">
              {snapshot.usageThisMonth.toLocaleString()} / {snapshot.quotaThisMonth.toLocaleString()} conversations ({pct}%)
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200" role="img" aria-label={`${pct}% of quota used`}>
              <div className="h-full rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-sm text-gray-600">
              {snapshot.tier} plan
              {!snapshot.gate.allowed && snapshot.gate.reason === "quota-exceeded"
                ? " · limit reached — guest chat resumes next month, or on upgrade."
                : ""}
            </p>
            <a href="/billing" className="text-sm font-medium text-gray-900 underline underline-offset-2">
              Orders &amp; Billing
            </a>
          </>
        ) : (
          <p className="text-sm text-gray-500">Usage is unavailable right now.</p>
        )}
      </div>
    </div>
  );
}
