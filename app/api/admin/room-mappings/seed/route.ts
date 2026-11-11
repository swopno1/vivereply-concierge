// Room-catalogue seeding (adapter Phase 3, session only; owners seed only
// their own property).
//   POST /api/admin/room-mappings/seed { propertyId }
// Copies the demo catalogue file into RoomMapping rows for a property,
// skipping slugs that already exist (never overwrites). This is how the
// demo property graduates from file to database — and how the row-by-row
// UUID verification gets recorded as data instead of memory.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { tenantFor, withTenant } from "@/lib/tenant-db";
import { DEMO_ROOMS } from "@/demo-config/rooms";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
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
  let created = 0;
  let skipped = 0;
  for (const room of DEMO_ROOMS) {
    const existing = await withTenant(tenant, (tx) =>
      tx.roomMapping.findUnique({
        where: { propertyId_slug: { propertyId, slug: room.slug } },
      })
    );
    if (existing) {
      skipped += 1;
      continue;
    }
    await withTenant(tenant, (tx) =>
      tx.roomMapping.create({
        data: {
          propertyId,
          slug: room.slug,
          name: room.name,
          basePricePoisha: room.basePricePoisha,
          suiteRoomId: room.suiteRoomId,
          highlights: room.highlights,
        },
      })
    );
    created += 1;
  }
  return NextResponse.json({ propertyId, created, skipped });
}
