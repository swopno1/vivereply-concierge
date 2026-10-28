// Main chat page (inside the shell route group, so the sidebar wraps
// it). Server component: it mints a direct chat token for this visit so
// /api/chat can verify every message, the same way the widget token
// is verified. Direct visits need no approved domain; embedding this
// page elsewhere is a separate concern (see README security section).

import Chat from "../components/Chat";
import { createChatToken } from "@/lib/auth";

export default function Home() {
  const token = createChatToken({
    propertyId: process.env.DEMO_PROPERTY_ID ?? "krishnachura-retreat",
    scope: "direct",
  });
  return <Chat token={token ?? ""} source="direct" />;
}
