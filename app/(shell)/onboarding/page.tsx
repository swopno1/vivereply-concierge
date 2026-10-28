// Admin onboarding page (inside the shell route group). Guarded like
// /staff and /admin: no session means a redirect to /login. The board
// itself is client-side (file uploads + multi-step state live there).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import OnboardingBoard from "../../components/OnboardingBoard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login?next=/onboarding");
  }
  return <OnboardingBoard />;
}
