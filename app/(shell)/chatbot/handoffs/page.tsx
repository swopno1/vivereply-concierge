// Chatbot → Handoffs (D1): explainer plus a deep link to the Suite
// board, derived from the binding URL. No new reads beyond the binding
// the section already loads.

import { redirect } from "next/navigation";
import { getSession, resolvePropertyId } from "@/lib/tenant";
import { getChatbotData } from "@/lib/dashboard";
import ChatbotSubnav from "../ChatbotSubnav";

export default async function ChatbotHandoffsPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/chatbot/handoffs");
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const data = await getChatbotData(propertyId);
  if (!data) redirect("/settings");
  const boardUrl = data.bindings[0] ? `${data.bindings[0].suiteBaseUrl.replace(/\/$/, "")}/admin/chatbot-admin` : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Handoffs</h1>
        <p className="text-sm text-gray-500">Guest chats your team takes over, for {data.propertyName}.</p>
      </header>
      <ChatbotSubnav />

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-gray-700">
          Your team answers handoffs in the Suite admin — conversations the chatbot passes to a
          person appear there with the full guest context.
        </p>
        {boardUrl ? (
          <a
            href={boardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-fit rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Open Suite board
          </a>
        ) : (
          <p className="text-sm text-gray-500">
            No booking system is connected, so there is no board to link yet.{" "}
            <a href="/chatbot/booking" className="underline">
              Connect one first.
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
