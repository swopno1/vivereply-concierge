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
import { resolveWidgetProperty } from "@/demo-config/widget-keys";
import { verifyChatToken } from "@/lib/auth";
import { isDomainApproved } from "@/lib/domains";
import { isPropertyActive } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full flex-col bg-white p-4 font-sans text-gray-900 antialiased">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0C1222]">
          <img src="/brand/vivereply-mark.svg" alt="" className="h-7 w-7" />
        </span>
        <h1 className="text-[15px] font-semibold">Vivereply Concierge</h1>
      </div>
      <p className="mt-3 text-sm text-gray-500">{message}</p>
    </main>
  );
}

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; token?: string }>;
}) {
  const params = await searchParams;
  // Database-aware resolution (multi-tenant core): seeded properties' keys
  // work here exactly as at the handshake — static-only lookup would strand
  // every property after the first.
  const property = await resolveWidgetProperty(params.key ?? null);
  const token = verifyChatToken(params.token);
  if (!property || !token) {
    // Technical cause stays server-side: guests get a plain line, not embed jargon.
    console.error("Widget rejected: missing property or invalid token.");
    return <ErrorPanel message="Chat is unavailable right now. Please try again in a moment." />;
  }
  if (token.scope !== "widget" || token.propertyId !== property.propertyId || !token.domain) {
    console.error("Widget rejected: token scope/property/domain mismatch.");
    return <ErrorPanel message="Chat is unavailable right now. Please try again in a moment." />;
  }
  if (!(await isDomainApproved(token.propertyId, token.domain))) {
    return <ErrorPanel message="This site is not approved to host this chat." />;
  }
  // Tenant kill-switch: a suspended property renders no chat panel.
  if (!(await isPropertyActive(token.propertyId))) {
    return <ErrorPanel message="Chat is unavailable right now. Please try again in a moment." />;
  }
  return <Chat compact title={property.title} token={params.token ?? ""} source="widget" />;
}
