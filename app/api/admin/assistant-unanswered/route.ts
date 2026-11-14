// Assistant unanswered-questions list (R1 Lane A). SUPER_ADMIN only.
//   GET -> latest misses, unresolved first (this list is how the corpus grows).
//   PATCH { id, resolved } -> mark a miss resolved once the corpus covers it.
// SERVICE PATH (marked): the table has RLS enabled with no tenant policy,
// so only the bypass role touches it; the route re-checks SUPER_ADMIN.
import { NextRequest, NextResponse } from "next/server";
import { prismaService } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const db = prismaService();
  const misses = await db.assistantUnanswered.findMany({
    orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const unresolved = misses.filter((m) => !m.resolvedAt).length;
  return NextResponse.json({
    misses: misses.map((m) => ({
      id: m.id,
      question: m.question,
      lang: m.lang,
      propertyId: m.propertyId,
      createdAt: m.createdAt.toISOString(),
      resolvedAt: m.resolvedAt?.toISOString() ?? null,
    })),
    unresolved,
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id || typeof body?.resolved !== "boolean") {
    return NextResponse.json({ error: "id and resolved are required." }, { status: 400 });
  }
  const db = prismaService();
  const updated = await db.assistantUnanswered
    .update({
      where: { id },
      data: { resolvedAt: body.resolved ? new Date() : null },
    })
    .catch(() => null);
  if (!updated) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: updated.id, resolvedAt: updated.resolvedAt?.toISOString() ?? null });
}
