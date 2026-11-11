// Bridge-token admin API (multi-tenant core). Every method requires the
// session cookie — no session, no list, no mints, no revokes. Owners see
// and touch only their own property's keys.
//   GET   -> [{ id, prefix, name, propertyId, active, createdAt }] (never hashes)
//   POST  -> { name, propertyId } mints a token; the full token is
//            returned ONCE here and can never be retrieved again
//   PATCH -> { id, active } revokes or reactivates a token (instant)
//
// The full token is not logged and not stored: the database keeps the
// prefix plus the secret's hash, so a database read cannot call the API.

import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaService } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { tenantFor, withTenant } from "@/lib/tenant-db";
import { mintBridgeToken } from "@/lib/bridge";
import { clientIp, logAudit } from "@/lib/audit";

function shape(row: {
  id: string;
  prefix: string;
  name: string;
  propertyId: string;
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    prefix: row.prefix,
    name: row.name,
    propertyId: row.propertyId,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  // Owners list their own keys (tenant path); super-admins list across
  // properties (SERVICE PATH, marked). Owner sessions always carry a
  // property — a null tenant here fails closed (unreachable).
  const tenant = tenantFor(session);
  if (session.role === "OWNER" && !tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const rows = tenant
    ? await withTenant(tenant, (tx) =>
        tx.bridgeToken.findMany({
          where: { propertyId: tenant },
          orderBy: { createdAt: "asc" },
        })
      )
    : await prismaService().bridgeToken.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(rows.map(shape));
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
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  if (!name || name.length > 100) {
    return NextResponse.json(
      { error: "Name is required (e.g. demo1 dashboard, max 100 characters)." },
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
  // answer 404 instead (owner properties always exist post-session).
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  const minted = mintBridgeToken();
  const row = await withTenant(tenant, (tx) =>
    tx.bridgeToken.create({
      data: { prefix: minted.prefix, secretHash: minted.secretHash, name, propertyId, active: true },
    })
  );
  // Prefix + name only — the secret is never logged (it is unrecoverable by design).
  await logAudit({ actorEmail: session.email, action: "bridge.mint", propertyId, detail: { prefix: row.prefix, name }, ip: clientIp(req) });
  return NextResponse.json({ ...shape(row), token: minted.token }, { status: 201 });
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
    return NextResponse.json({ error: "Token id is required." }, { status: 400 });
  }
  // Owners read+update inside their own tenant (RLS confines the id
  // lookup: another tenant's id reads as missing → same 404).
  // Super-admins act cross-property (SERVICE PATH, marked).
  const tenant = tenantFor(session);
  if (session.role === "OWNER" && !tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const current = tenant
    ? await withTenant(tenant, (tx) => tx.bridgeToken.findUnique({ where: { id } }))
    : await prismaService().bridgeToken.findUnique({ where: { id } });
  if (!current || !sessionCan(session, current.propertyId)) {
    return NextResponse.json({ error: "Token not found." }, { status: 404 });
  }
  const row = tenant
    ? await withTenant(tenant, (tx) => tx.bridgeToken.update({ where: { id }, data: { active } }))
    : await prismaService().bridgeToken.update({ where: { id }, data: { active } });
  await logAudit({
    actorEmail: session.email,
    action: active ? "bridge.reactivate" : "bridge.revoke",
    propertyId: current.propertyId,
    detail: { prefix: current.prefix, name: current.name },
    ip: clientIp(req),
  });
  return NextResponse.json(shape(row));
}
