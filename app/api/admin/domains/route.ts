// Approved-domain admin API (step 4.5, multi-tenant core). Every method
// requires the session cookie — no session, no list, no changes. Owners
// see and touch only their own property's rows.
//   GET    -> [{ id, domain, propertyId, active, createdAt }]
//   POST   -> { domain, propertyId } creates a row (409 if it exists)
//   PATCH  -> { id, active } activates or deactivates a row
// Domain input is a bare hostname only (no scheme, no port, no path).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan } from "@/lib/tenant";
import { normalizeHostname } from "@/lib/domains";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const rows = await prisma.approvedDomain.findMany({
    where: session.role === "OWNER" ? { propertyId: session.propertyId ?? "" } : {},
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const domain = normalizeHostname(typeof body?.domain === "string" ? body.domain : "");
  const propertyId =
    typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  if (!domain) {
    return NextResponse.json(
      { error: "Enter just the hostname, e.g. demo1.vivereply.com (no https://, no port, no path)." },
      { status: 400 }
    );
  }
  if (!propertyId || propertyId.length > 100) {
    return NextResponse.json({ error: "Property ID is required (max 100 characters)." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  const existing = await prisma.approvedDomain.findUnique({
    where: { domain_propertyId: { domain, propertyId } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "That domain is already listed for this property — reactivate it instead." },
      { status: 409 }
    );
  }
  const row = await prisma.approvedDomain.create({ data: { domain, propertyId, active: true } });
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const active = body?.active === true;
  if (!id) {
    return NextResponse.json({ error: "Domain id is required." }, { status: 400 });
  }
  const current = await prisma.approvedDomain.findUnique({ where: { id } });
  if (!current || !sessionCan(session, current.propertyId)) {
    return NextResponse.json({ error: "Domain not found." }, { status: 404 });
  }
  const row = await prisma.approvedDomain.update({ where: { id }, data: { active } });
  return NextResponse.json(row);
}
