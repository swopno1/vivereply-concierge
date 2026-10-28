// Register-property page (auth Tier 1, SUPER_ADMIN only). The routine path
// to a new tenant: property + domains + owner login in one submit. No
// public signup exists — this page (and the seed file behind it) is the
// only way a login comes into being.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/tenant";
import RegisterProperty from "../../../components/RegisterProperty";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin/register");
  }
  if (session.role !== "SUPER_ADMIN") {
    redirect("/settings");
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Register property</h1>
        <p className="text-sm text-gray-500">
          One submit creates the property, its approved domains, and its owner login with a
          temporary password (shown once). Rooms and booking backend follow in Settings.
        </p>
      </header>
      <RegisterProperty />
    </div>
  );
}
