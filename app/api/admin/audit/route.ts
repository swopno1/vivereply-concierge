// Audit-trail read API (SUPER_ADMIN only). Owners never see this —
// their own actions are boring to them and other tenants' rows are
// nobody's business. Newest first, capped at 100, optional
// ?propertyId= to scope one tenant.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const propertyId = req.nextUrl.searchParams.get("propertyId")?.trim() || null;
  const rows = await prisma.auditLog.findMany({
    where: propertyId ? { propertyId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(rows);
}
