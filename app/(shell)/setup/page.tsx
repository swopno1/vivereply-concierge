// Getting-started wizard (server): resolves the in-scope property and
// renders SetupWizard with the current derived state. Super-admins can
// preview any ACTIVE property via ?property=; owners always see their own.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, resolvePropertyId, sessionOwnerVerified } from "@/lib/tenant";
import { deriveSetupState, getSetupFacts } from "@/lib/setup";
import SetupWizard from "../../components/SetupWizard";

export default async function SetupPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const facts = await getSetupFacts(propertyId, await sessionOwnerVerified(session));
  // No property exists (empty DB, or a bad ?property=): explain brand
  // mode + the onboarding path instead of bouncing to an empty Settings.
  if (!facts) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Getting started</h1>
          <p className="mt-1 text-sm text-gray-600">
            No resort is configured yet. The Assistant chat is currently the{" "}
            <strong className="font-semibold text-gray-900">Vivereply brand assistant</strong> — it
            answers questions about ViveReply products (Suite, Chatbot, onboarding, RoomReady,
            payments) from our official site and docs. It has no resort data: no bookings,
            availability, or room prices.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">How a resort gets onboarded later</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>Register the resort — it appears here as its own property.</li>
            <li>Teach it the resort: business details, website, documents.</li>
            <li>Connect bookings and add the room catalogue with live prices.</li>
            <li>Approve its domains and paste the widget snippet on its site.</li>
          </ol>
          <p className="mt-2 text-sm text-gray-600">
            Full walkthrough: <span className="font-medium text-gray-900">owner-guide.md</span> in
            the repo, and the docs at{" "}
            <a
              href="https://vivereply.com/docs/chatbot/setup"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              vivereply.com/docs/chatbot/setup
            </a>
            .
          </p>
        </div>
      </main>
    );
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.vivereply.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const statusUrl =
    session.role === "OWNER"
      ? "/api/admin/setup-status"
      : `/api/admin/setup-status?propertyId=${encodeURIComponent(propertyId)}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Getting started</h1>
        <p className="text-sm text-gray-600">
          {facts.propertyName} · signup to live chatbot, one verified step at a time. Progress is
          saved automatically — leave and resume whenever you like.
        </p>
      </div>
      <SetupWizard initial={deriveSetupState(facts)} propertyId={propertyId} origin={origin} statusUrl={statusUrl} />
    </main>
  );
}
