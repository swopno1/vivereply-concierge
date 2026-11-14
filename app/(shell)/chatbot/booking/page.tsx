// Chatbot → Booking system (D1): the settings booking block (Suite
// bindings + backend failures) plus the room catalogues, moved whole.
// Same reads, same components, same verified-owner gate as settings.

import { redirect } from "next/navigation";
import { getSession, resolvePropertyId, sessionOwnerVerified } from "@/lib/tenant";
import { getChatbotData } from "@/lib/dashboard";
import VerifyPrompt from "../../../components/VerifyPrompt";
import SuiteBindings from "../../../components/SuiteBindings";
import RoomCatalogues from "../../../components/RoomCatalogues";
import ChatbotSubnav from "../ChatbotSubnav";
import { Section } from "../_sections";

export default async function ChatbotBookingPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/chatbot/booking");
  if (!(await sessionOwnerVerified(session))) {
    return <VerifyPrompt email={session.email} />;
  }
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const data = await getChatbotData(propertyId);
  if (!data) redirect("/settings");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Booking system</h1>
        <p className="text-sm text-gray-500">Suite connection and room catalogue for {data.propertyName}.</p>
      </header>
      <ChatbotSubnav />

      <Section
        id="booking"
        title="Booking system"
        blurb="One connection per property: the address above is what answers your guests' price and availability questions. Test runs server-side and never reveals the key. Changes apply on the next chat message."
      >
        <SuiteBindings initial={data.bindings} initialPropertyId={propertyId} />
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Recent backend failures</p>
          {data.backendFailures.length === 0 ? (
            <p className="text-sm text-gray-500">None in the last 50 backend calls.</p>
          ) : (
            data.backendFailures.map((f, i) => (
              <p key={i} className="text-sm text-gray-700">
                <span className="font-mono">{f.toolName}</span> · {f.propertyId} · {f.error}
              </p>
            ))
          )}
        </div>
      </Section>

      <Section
        id="rooms"
        title="Room catalogues"
        blurb="One room list per property. Sync it from your booking system, or add rows manually — rows govern chat once present."
      >
        <RoomCatalogues initialPropertyId={propertyId} />
      </Section>
    </div>
  );
}
