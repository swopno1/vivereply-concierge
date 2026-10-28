// Admin configure page (inside the shell route group: nav and sign-out
// live in the sidebar, so this page keeps only its own content).
// Server-rendered, protected: no valid session cookie means a redirect
// to /login, before any domain row is read or rendered. The domain list
// itself comes from the database here; adds and toggles go through
// /api/admin/domains, which re-checks the session on every call.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import AdminDomains from "../../components/AdminDomains";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login?next=/admin");
  }

  const rows = await prisma.approvedDomain.findMany({ orderBy: { createdAt: "asc" } });
  const initial = rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    propertyId: r.propertyId,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <header className="border-b pb-3">
        <h1 className="text-xl font-bold">Admin — Approved domains</h1>
        <p className="text-sm text-gray-500">
          Only these sites can host the widget. Deactivating a domain stops its widget on the
          next chat message.
        </p>
      </header>
      <div className="py-4">
        <AdminDomains initial={initial} />
      </div>
    </div>
  );
}
