// Approved-domain admin API (step 4.5, multi-tenant core). Every method
// requires the session cookie — no session, no list, no changes. Owners
// see and touch only their own property's rows.
//   GET    -> [{ id, domain, propertyId, active, createdAt }]
//   POST   -> { domain, propertyId } creates a row (409 if it exists)
//   PATCH  -> { id, active } activates or deactivates a row
// Domain input is a bare hostname only (no scheme, no port, no path).

import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaService } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { tenantFor, withTenant } from "@/lib/tenant-db";
import { normalizeHostname } from "@/lib/domains";
import { clientIp, logAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  // Owners list their own rows (tenant path); super-admins list across
  // properties (SERVICE PATH, marked).
  const tenant = tenantFor(session);
  if (session.role === "OWNER" && !tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const rows = tenant
    ? await withTenant(tenant, (tx) =>
        tx.approvedDomain.findMany({
          where: { propertyId: tenant },
          orderBy: { createdAt: "asc" },
        })
      )
    : await prismaService().approvedDomain.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
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
  const tenant = tenantFor(session, propertyId);
  if (!tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  // FK honesty: creating for a ghost property would 500 on the FK —
  // answer 404 instead.
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  const existing = await withTenant(tenant, (tx) =>
    tx.approvedDomain.findUnique({
      where: { domain_propertyId: { domain, propertyId } },
    })
  );
  if (existing) {
    return NextResponse.json(
      { error: "That domain is already listed for this property — reactivate it instead." },
      { status: 409 }
    );
  }
  const row = await withTenant(tenant, (tx) =>
    tx.approvedDomain.create({ data: { domain, propertyId, active: true } })
  );
  await logAudit({ actorEmail: session.email, action: "domain.add", propertyId, detail: { domain }, ip: clientIp(req) });
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const active = body?.active === true;
  if (!id) {
    return NextResponse.json({ error: "Domain id is required." }, { status: 400 });
  }
  // Owners read+update inside their own tenant (RLS confines the id
  // lookup: another tenant's id reads as missing → same 404).
  // Super-admins act cross-property (SERVICE PATH, marked).
  const tenant = tenantFor(session);
  if (session.role === "OWNER" && !tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const current = tenant
    ? await withTenant(tenant, (tx) => tx.approvedDomain.findUnique({ where: { id } }))
    : await prismaService().approvedDomain.findUnique({ where: { id } });
  if (!current || !sessionCan(session, current.propertyId)) {
    return NextResponse.json({ error: "Domain not found." }, { status: 404 });
  }
  const row = tenant
    ? await withTenant(tenant, (tx) => tx.approvedDomain.update({ where: { id }, data: { active } }))
    : await prismaService().approvedDomain.update({ where: { id }, data: { active } });
  await logAudit({
    actorEmail: session.email,
    action: active ? "domain.activate" : "domain.deactivate",
    propertyId: current.propertyId,
    detail: { domain: current.domain },
    ip: clientIp(req),
  });
  return NextResponse.json(row);
}
