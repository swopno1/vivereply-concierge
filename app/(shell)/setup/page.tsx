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
  if (!facts) redirect("/settings");
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
