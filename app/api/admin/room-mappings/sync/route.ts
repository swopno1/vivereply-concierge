// Room-catalogue sync (Suite Handover D consumer; owners sync only
// their own property).
//   POST /api/admin/room-mappings/sync { propertyId }
// Fetches GET {binding}/api/concierge/rooms with the binding's secret
// and REPLACES the property's RoomMapping rows wholesale — in one
// transaction, only after the full response is fetched and validated.
// A failed or partial fetch changes nothing. Manual add/edit/delete
// keeps working exactly as before for any property.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { tenantFor, withTenant } from "@/lib/tenant-db";
import { decryptSecret } from "@/lib/secrets";
import { SUITE_API_VERSION, fetchSuiteRooms } from "@/lib/suite";
import { syncRoomCatalogue, type SyncedRoom } from "@/lib/room-sync";

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
  // Same ghost-property honesty as the mappings API: a missing row (or a
  // missing binding) answers plainly instead of 500ing on the FK.
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  const binding = await withTenant(tenant, (tx) =>
    tx.propertyBinding.findUnique({ where: { propertyId } })
  );
  if (!binding) {
    return NextResponse.json(
      { error: "This property has no booking system connection yet — save one in Settings → Booking system first." },
      { status: 400 }
    );
  }
  let secret: string | null = null;
  if (binding.secretEnc) {
    try {
      secret = decryptSecret(binding.secretEnc);
    } catch {
      return NextResponse.json({ error: "Stored secret cannot be read." }, { status: 500 });
    }
  }
  try {
    const result = await syncRoomCatalogue({
      fetchRooms: () =>
        fetchSuiteRooms({
          baseUrl: binding.suiteBaseUrl.replace(/\/$/, ""),
          secret,
          // Our spoken version (same as the connection test), not the row's.
          version: SUITE_API_VERSION,
        }),
      // One withTenant block = one transaction: the old list and the new
      // list never mix, and a mid-write failure rolls everything back.
      replaceAll: async (rooms: SyncedRoom[]) =>
        withTenant(tenant, async (tx) => {
          await tx.roomMapping.deleteMany({ where: { propertyId } });
          if (rooms.length > 0) {
            await tx.roomMapping.createMany({
              data: rooms.map((r) => ({ propertyId, ...r })),
            });
          }
          return rooms.length;
        }),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, propertyId, count: result.count });
  } catch (e) {
    console.error("Room sync error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save the synced rooms." }, { status: 500 });
  }
}
