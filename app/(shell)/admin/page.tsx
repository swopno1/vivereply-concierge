// Admin ops overview (inside the shell route group). Server-rendered,
// SUPER_ADMIN only: no session means /login, an owner session means
// /settings — before any row is read. Configuration (domains, keys,
// bindings, catalogues) lives in /settings; this page is oversight across
// ALL properties: who is registered, whose onboarding needs a re-run
// decision, and which backends recently failed.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import OnboardingApprovals from "../../components/OnboardingApprovals";
import OwnerActions from "../../components/OwnerActions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin");
  }
  if (session.role !== "SUPER_ADMIN") {
    redirect("/settings");
  }

  const properties = await prisma.property.findMany({
    orderBy: { id: "asc" },
    include: { users: { select: { id: true, email: true, role: true, active: true } } },
  });
  const runRows = await prisma.onboardingRun.findMany({ orderBy: { updatedAt: "desc" } });
  const initialRuns = runRows.map((r) => ({
    propertyId: r.propertyId,
    status: r.status,
    approvedRerun: r.approvedRerun,
    approvedBy: r.approvedBy,
    updatedAt: r.updatedAt.toISOString(),
  }));
  const recentLogs = await prisma.toolCallLog.findMany({
    where: {
      toolName: {
        in: [
          "check_availability",
          "get_quote",
          "create_booking_draft",
          "lookup_booking_by_code",
          "request_booking_details",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { conversation: { select: { propertyId: true } } },
  });
  const backendFailures = recentLogs
    .filter((l) => {
      const out = l.output as { error?: unknown } | null;
      return out !== null && typeof out === "object" && typeof out.error === "string";
    })
    .slice(0, 10)
    .map((l) => ({
      toolName: l.toolName,
      error: (l.output as { error: string }).error,
      propertyId: l.conversation.propertyId,
      createdAt: l.createdAt.toISOString(),
    }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Admin — Operations</h1>
        <p className="text-sm text-gray-500">
          Cross-property oversight. Per-property configuration lives in{" "}
          <a href="/settings" className="underline">
            Settings
          </a>
          .
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <header className="border-b border-gray-200 pb-2">
          <h2 className="text-lg font-bold text-gray-900">Properties & owners</h2>
          <p className="text-sm text-gray-500">
            Registered tenants (seed file only — there is no signup). Owners see exactly their
            property.
          </p>
        </header>
        {properties.length === 0 && (
          <p className="text-sm text-gray-500">
            No properties seeded yet. Register the first one with the seed file.
          </p>
        )}
        {properties.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">
                {p.name} <span className="font-mono text-xs text-gray-500">({p.id})</span>
              </p>
              {p.users.length === 0 ? (
                <p className="truncate text-sm text-gray-500">no owner login yet</p>
              ) : (
                <OwnerActions initial={p.users} />
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                p.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
              }`}
            >
              {p.status}
            </span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <header className="border-b border-gray-200 pb-2">
          <h2 className="text-lg font-bold text-gray-900">Onboarding re-runs</h2>
          <p className="text-sm text-gray-500">
            Each property gets one ingestion run. Approving unlocks exactly one more.
          </p>
        </header>
        <OnboardingApprovals initial={initialRuns} approver={session.email ?? "super-admin"} />
      </section>

      <section className="flex flex-col gap-3">
        <header className="border-b border-gray-200 pb-2">
          <h2 className="text-lg font-bold text-gray-900">Recent backend failures</h2>
          <p className="text-sm text-gray-500">Last 50 backend calls, all properties.</p>
        </header>
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          {backendFailures.length === 0 ? (
            <p className="text-sm text-gray-500">None in the last 50 backend calls.</p>
          ) : (
            backendFailures.map((f, i) => (
              <p key={i} className="text-sm text-gray-700">
                <span className="font-mono">{f.toolName}</span> · {f.propertyId} · {f.error}
              </p>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
