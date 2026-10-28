// Bridge-token admin API. Every method requires the admin session
// cookie — no session, no list, no mints, no revokes.
//   GET   -> [{ id, prefix, name, propertyId, active, createdAt }] (never hashes)
//   POST  -> { name, propertyId } mints a token; the full token is
//            returned ONCE here and can never be retrieved again
//   PATCH -> { id, active } revokes or reactivates a token (instant)
//
// The full token is not logged and not stored: the database keeps the
// prefix plus the secret's hash, so a database read cannot call the API.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { mintBridgeToken } from "@/lib/bridge";

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
}

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
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const rows = await prisma.bridgeToken.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(rows.map(shape));
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
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
  const minted = mintBridgeToken();
  const row = await prisma.bridgeToken.create({
    data: { prefix: minted.prefix, secretHash: minted.secretHash, name, propertyId, active: true },
  });
  return NextResponse.json({ ...shape(row), token: minted.token }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const active = body?.active === true;
  if (!id) {
    return NextResponse.json({ error: "Token id is required." }, { status: 400 });
  }
  const row = await prisma.bridgeToken.update({ where: { id }, data: { active } }).catch(() => null);
  if (!row) {
    return NextResponse.json({ error: "Token not found." }, { status: 404 });
  }
  return NextResponse.json(shape(row));
}
