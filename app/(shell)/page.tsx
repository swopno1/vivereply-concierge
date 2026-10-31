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
import { prisma } from "@/lib/prisma";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const token = createChatToken({ propertyId, scope: "direct" });
  // Orientation strip: a cold visitor must learn in 3 seconds whose
  // chat this is and what to try. Owners get a setup shortcut instead
  // of the demo badge.
  const [property, profile] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId } }).catch(() => null),
    prisma.propertyProfile.findUnique({ where: { propertyId } }).catch(() => null),
  ]);
  const name = profile?.assistantName?.trim() || property?.name || "Vivereply Concierge";
  const isOwner = !!session && (session.role === "OWNER" || session.role === "SUPER_ADMIN");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-bold text-gray-900">{name}</h1>
          {!isOwner && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              Live demo
            </span>
          )}
        </div>
        <p className="mx-auto w-full max-w-3xl text-sm text-gray-600">
          {isOwner ? (
            <>
              Chatting as your guests see it.{" "}
              <a href="/setup" className="underline">
                Getting started
              </a>{" "}
              walks through the full setup.
            </>
          ) : (
            <>
              Ask about rooms, prices, or your stay — in English or Bengali. Own a
              resort?{" "}
              <a href="/signup" className="underline">
                Put this on your site
              </a>
              .
            </>
          )}
        </p>
        <nav
          aria-label="Project links"
          className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-4 gap-y-1 pt-1 text-sm"
        >
          <a
            href="https://demo1.vivereply.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            Live resort demo
          </a>
          <a
            href="https://vivereply.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            ViveReply
          </a>
          <a
            href="https://vivereply.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            Chatbot docs
          </a>
        </nav>
      </div>
      <div className="min-h-0 flex-1">
        <Chat token={token ?? ""} source="direct" />
      </div>
    </div>
  );
}
