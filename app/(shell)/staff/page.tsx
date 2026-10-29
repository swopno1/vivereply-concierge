// Staff handoff board (inside the shell route group). The triage loop for
// ONE property: filter by status, read one transcript at a time, assign,
// note, and resolve. Owners see only their own property; the super-admin
// may pass ?property=<id>. Session + verified-email gates run before any
// handoff is read — transcripts are guest PII, not config preview.

import { redirect } from "next/navigation";
import { getSession, resolvePropertyId, sessionOwnerVerified } from "@/lib/tenant";
import StaffBoard from "../../components/StaffBoard";
import VerifyPrompt from "../../components/VerifyPrompt";

export const dynamic = "force-dynamic";

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/staff");
  }
  if (!(await sessionOwnerVerified(session))) {
    return <VerifyPrompt email={session.email} />;
  }
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Staff — Handoffs</h1>
        <p className="text-sm text-gray-500">
          Conversations the Concierge escalated for {propertyId}. Pick one up, resolve it, move
          on.
        </p>
      </header>
      <div className="py-4">
        <StaffBoard propertyId={propertyId} defaultAuthor={session.email ?? ""} />
      </div>
      <p className="border-t border-gray-200 pt-3 text-sm text-gray-500">
        Signed-in owners see only their own property&apos;s handoffs.
      </p>
    </div>
  );
}
