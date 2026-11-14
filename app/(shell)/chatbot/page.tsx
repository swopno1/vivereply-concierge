// Chatbot overview (D1): live/paused state, this month's usage, binding
// chip, links to the section pages. Read-only composition from the
// billing snapshot + chatbot data. Note: no owner pause toggle exists
// in the codebase (pause derives from the billing gate), so none is
// shown — see the D1 PR.

import { redirect } from "next/navigation";
import { getSession, resolvePropertyId } from "@/lib/tenant";
import { getBillingSnapshot } from "@/lib/billing";
import { getChatbotData } from "@/lib/dashboard";
import ChatbotSubnav from "./ChatbotSubnav";

const LINKS = [
  { href: "/chatbot/widget", title: "Widget & keys", blurb: "Embed snippet, approved domains, bridge keys." },
  { href: "/chatbot/booking", title: "Booking system", blurb: "Suite connection, room catalogue, backend health." },
  { href: "/chatbot/knowledge", title: "Knowledge", blurb: "Chatbot name, greeting, tone, onboarding runs." },
  { href: "/chatbot/handoffs", title: "Handoffs", blurb: "Where your team answers guests." },
  { href: "/chatbot/usage", title: "Usage", blurb: "Quota meter for the current period." },
];

export default async function ChatbotOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/chatbot");
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const [snapshot, data] = await Promise.all([
    getBillingSnapshot(propertyId, new Date()).catch(() => null),
    getChatbotData(propertyId),
  ]);
  if (!data) redirect("/settings");
  const paused = snapshot ? !snapshot.gate.allowed : false;
  const usagePct =
    snapshot && snapshot.quotaThisMonth > 0
      ? Math.min(100, Math.round((snapshot.usageThisMonth / snapshot.quotaThisMonth) * 100))
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Chatbot</h1>
        <p className="text-sm text-gray-500">Guest-facing assistant for {data.propertyName}.</p>
      </header>
      <ChatbotSubnav />
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">
          Status:{" "}
          {paused ? (
            <span className="text-red-700">
              Paused{snapshot && snapshot.gate.reason !== "ok" ? ` (${snapshot.gate.reason})` : ""}
            </span>
          ) : (
            <span className="text-green-700">Live</span>
          )}
        </p>
        {snapshot && (
          <p className="text-sm text-gray-600">
            {snapshot.usageThisMonth.toLocaleString()} / {snapshot.quotaThisMonth.toLocaleString()} conversations this month ({usagePct}%)
          </p>
        )}
        <p className="text-sm text-gray-600">
          Booking system: {data.bindings.length > 0 ? "connected" : "not connected"}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:bg-gray-50"
          >
            <p className="text-sm font-semibold text-gray-900">{l.title}</p>
            <p className="text-sm text-gray-500">{l.blurb}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
