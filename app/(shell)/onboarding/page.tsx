// Onboarding page (inside the shell route group). Guarded like /staff:
// no session means a redirect to /login. Owners onboard only their own
// property (the board opens loaded for it); the super-admin may pass
// ?property=<id>. The board itself is client-side (file uploads +
// multi-step state live there); every API call re-checks the session.

import { redirect } from "next/navigation";
import { getSession, resolvePropertyId } from "@/lib/tenant";
import OnboardingBoard from "../../components/OnboardingBoard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/onboarding");
  }
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  return <OnboardingBoard initialPropertyId={propertyId} canApprove={session.role === "SUPER_ADMIN"} />;
}
