// Admin configure page (step 4.5). Server-rendered, protected: no
// valid session cookie means a redirect to /login, before any domain
// row is read or rendered. The domain list itself comes from the
// database here; adds and toggles go through /api/admin/domains,
// which re-checks the session on every call.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import AdminDomains from "../components/AdminDomains";
import LogoutButton from "../components/LogoutButton";

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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col p-4">
      <header className="flex items-start justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="text-xl font-bold">Admin — Approved domains</h1>
          <p className="text-sm text-gray-500">
            Only these sites can host the widget. Deactivating a domain stops its widget on the
            next chat message.
          </p>
        </div>
        <LogoutButton />
      </header>
      <div className="py-4">
        <AdminDomains initial={initial} />
      </div>
      <p className="border-t pt-3 text-sm text-gray-500">
        <a href="/staff" className="underline">
          Staff view (handoffs)
        </a>{" "}
        · <a href="/" className="underline">Back to chat</a>
      </p>
    </main>
  );
}
