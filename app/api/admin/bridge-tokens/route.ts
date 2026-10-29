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
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
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
  const rows = await prisma.bridgeToken.findMany({
    where: session.role === "OWNER" ? { propertyId: session.propertyId ?? "" } : {},
    orderBy: { createdAt: "asc" },
  });
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
  const minted = mintBridgeToken();
  const row = await prisma.bridgeToken.create({
    data: { prefix: minted.prefix, secretHash: minted.secretHash, name, propertyId, active: true },
  });
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
  const current = await prisma.bridgeToken.findUnique({ where: { id } });
  if (!current || !sessionCan(session, current.propertyId)) {
    return NextResponse.json({ error: "Token not found." }, { status: 404 });
  }
  const row = await prisma.bridgeToken.update({ where: { id }, data: { active } });
  await logAudit({
    actorEmail: session.email,
    action: active ? "bridge.reactivate" : "bridge.revoke",
    propertyId: current.propertyId,
    detail: { prefix: current.prefix, name: current.name },
    ip: clientIp(req),
  });
  return NextResponse.json(shape(row));
}
