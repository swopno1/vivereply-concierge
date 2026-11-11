// Main chat page (inside the shell route group, so the sidebar wraps
// it). Server component: it mints a chat token for this visit so
// /api/chat can verify every message, the same way the widget token
// is verified. Signed-out visitors go to login (no public demo). An
// owner chats with their own resort here (OWNER is pinned to its own
// property; a ?property= override is ignored, never another resort's
// and never the demo); the super-admin may pass ?property=<id> to
// preview another property's chat, or — with no ?property= — gets the
// brand assistant (scope "brand", no property, static corpus, no DB).
// Direct visits need no approved domain; embedding this page
// elsewhere is a separate concern (see README security section).

import { redirect } from "next/navigation";
import Chat from "../components/Chat";
import { createChatToken } from "@/lib/auth";
import { getSession, resolvePropertyId } from "@/lib/tenant";
import { withTenant } from "@/lib/tenant-db";
import { BRAND_GREETING, BRAND_SUGGESTIONS } from "@/lib/brand-knowledge";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  // No public demo: signed-out visitors go to login (the demo property
  // was dropped — nothing here serves strangers anymore).
  if (!session) redirect("/login?next=/");
  const params = (await searchParams) ?? {};
  // Brand mode: super-admin with no property selected chats with the
  // ViveReply brand assistant (static corpus, no resort data, no DB).
  // Everyone else flows below: owners pinned to their own property,
  // super-admin preview via ?property=.
  if (session.role === "SUPER_ADMIN" && !params.property) {
    const token = createChatToken({ propertyId: "", scope: "brand" });
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-bold text-gray-900">Vivereply brand assistant</h1>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              Brand mode
            </span>
          </div>
          <p className="mx-auto w-full max-w-3xl text-sm text-gray-600">
            Answers about ViveReply products from our official site and docs — Suite,
            Chatbot, onboarding, RoomReady, payments. No resort data here: no
            bookings, availability, or room prices.
          </p>
          <nav
            aria-label="Project links"
            className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-4 gap-y-1 pt-1 text-sm"
          >
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
          <Chat token={token ?? ""} source="direct" greeting={BRAND_GREETING} suggestions={BRAND_SUGGESTIONS} />
        </div>
      </div>
    );
  }
  const propertyId = await resolvePropertyId(session, params.property);
  const token = createChatToken({ propertyId, scope: "direct" });
  // Orientation strip: a cold visitor must learn in 3 seconds whose
  // chat this is and what to try.
  const [property, profile] = await withTenant(propertyId, (tx) =>
    Promise.all([
      tx.property.findUnique({ where: { id: propertyId } }).catch(() => null),
      tx.propertyProfile.findUnique({ where: { propertyId } }).catch(() => null),
    ])
  );
  const name = profile?.assistantName?.trim() || property?.name || "Vivereply Concierge";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-bold text-gray-900">{name}</h1>
        </div>
        <p className="mx-auto w-full max-w-3xl text-sm text-gray-600">
          Chatting as your guests see it.{" "}
          <a href="/setup" className="underline">
            Getting started
          </a>{" "}
          walks through the full setup.
        </p>
        <nav
          aria-label="Project links"
          className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-4 gap-y-1 pt-1 text-sm"
        >
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
