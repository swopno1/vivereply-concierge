// Super-admin unanswered list (R1 Lane A): questions the platform
// corpus could not answer, newest first. OWNER sessions are refused
// (their misses are still logged — they just can't see this page).

import { redirect } from "next/navigation";
import { getSession } from "@/lib/tenant";
import { prismaService } from "@/lib/prisma";
import UnansweredList from "../../../components/UnansweredList";

export const dynamic = "force-dynamic";

export default async function UnansweredPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/staff/unanswered");
  if (session.role !== "SUPER_ADMIN") redirect("/");
  const db = prismaService();
  const rows = await db.assistantUnanswered
    .findMany({ orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }], take: 200 })
    .catch(() => []);
  const unresolved = rows.filter((r) => !r.resolvedAt).length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Unanswered assistant questions</h1>
        <p className="text-sm text-gray-500">
          {unresolved} open · every miss is a corpus gap to close, then resolve here.
        </p>
      </header>
      <UnansweredList
        initial={rows.map((r) => ({
          id: r.id,
          question: r.question,
          lang: r.lang,
          propertyId: r.propertyId,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
