// Widget panel (step 4.5). Server component now, because the token
// must be verified with SESSION_SECRET — a secret that must never
// reach the browser. The embed script passes ?key=...&token=...:
//   - token missing, tampered, or expired -> error panel, no chat
//   - token's property does not match the key's property -> error
//   - token's domain is no longer approved -> error (deactivation
//     takes effect here too, not just at the handshake)
// Otherwise the same Chat component as / renders, in compact mode,
// carrying the token so /api/chat can verify every message.

import Chat from "../components/Chat";
import { getWidgetProperty } from "@/demo-config/widget-keys";
import { verifyChatToken } from "@/lib/auth";
import { isDomainApproved } from "@/lib/domains";

export const dynamic = "force-dynamic";

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full flex-col p-4">
      <h1 className="text-xl font-bold">Vivereply Concierge</h1>
      <p className="text-sm text-gray-500">{message}</p>
    </main>
  );
}

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; token?: string }>;
}) {
  const params = await searchParams;
  const property = getWidgetProperty(params.key ?? null);
  const token = verifyChatToken(params.token);
  if (!property || !token) {
    return <ErrorPanel message="This demo widget is not configured. Check the embed script's data-key." />;
  }
  if (token.scope !== "widget" || token.propertyId !== property.propertyId || !token.domain) {
    return <ErrorPanel message="This demo widget is not configured. Check the embed script's data-key." />;
  }
  if (!(await isDomainApproved(token.propertyId, token.domain))) {
    return <ErrorPanel message="This site is not approved to host this chat." />;
  }
  return <Chat compact title={property.title} token={params.token ?? ""} source="widget" />;
}
