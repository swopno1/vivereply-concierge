// Main chat page (inside the shell route group, so the sidebar wraps
// it). Server component: it mints a direct chat token for this visit so
// /api/chat can verify every message, the same way the widget token
// is verified. The token's property is the viewer's resolved property —
// an owner chats with their own resort here; the super-admin may pass
// ?property=<id> to preview another; signed-out visitors get the demo
// property. Direct visits need no approved domain; embedding this
// page elsewhere is a separate concern (see README security section).

import Chat from "../components/Chat";
import { createChatToken } from "@/lib/auth";
import { getSession, resolvePropertyId } from "@/lib/tenant";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const token = createChatToken({ propertyId, scope: "direct" });
  return <Chat token={token ?? ""} source="direct" />;
}
