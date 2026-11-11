// Billing page (Phase 3, OWNER only). Plan + trial state + usage +
// next invoice date + subscribe/change/cancel + overage toggle. NO
// DOLLAR FIGURES anywhere until the founder says publish — plan
// names, conversation limits, days, and counts only. Signed-out
// owners bounce to login; unverified owners get the VerifyPrompt
// (money moves only on verified accounts); super-admins get a clean
// access-denied panel (billing is per-resort, owner-managed).
import { redirect } from "next/navigation";
import { getSession, sessionOwnerVerified } from "@/lib/tenant";
import { getBillingSnapshot } from "@/lib/billing";
import VerifyPrompt from "../../components/VerifyPrompt";
import BillingClient from "../../components/BillingClient";

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ checkout?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/billing");
  }
  if (session.role !== "OWNER" || !session.propertyId) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4 md:p-6">
        <h1 className="text-xl font-bold text-gray-900">Billing</h1>
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          Billing is per-resort and managed by the resort owner — there
          is nothing to show on this account.
        </p>
      </div>
    );
  }
  if (!(await sessionOwnerVerified(session))) {
    return <VerifyPrompt email={session.email} />;
  }
  const params = (await searchParams) ?? {};
  // SERVICE READ (marked): the owner's own subscription + usage.
  const snapshot = await getBillingSnapshot(session.propertyId, new Date());
  return (
    <BillingClient
      snapshot={{
        ...snapshot,
        trialEndsAt: snapshot.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: snapshot.currentPeriodEnd?.toISOString() ?? null,
      }}
      checkout={params.checkout === "success" || params.checkout === "cancelled" ? params.checkout : null}
    />
  );
}
