// Room-mapping health probe (CA-7). Same auth as the mappings API: session
// cookie, verified owner, own property only. For each mapped room, hits
// the backend availability endpoint for a near-future stay: 404 means the
// Suite room is gone/renamed (broken mapping), anything else means the id
// resolves (even 0 available — sold out is healthy).
import { NextRequest, NextResponse } from "next/server";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { tenantFor, withTenant } from "@/lib/tenant-db";
import { resolveSuiteBinding } from "@/lib/suite";
import { checkRoomMappings } from "@/lib/room-mapping-health";

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "";
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId query is required." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }

  const tenant = tenantFor(session, propertyId);
  if (!tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const rows = await withTenant(tenant, (tx) => tx.roomMapping.findMany({ where: { propertyId } }));
  const resolved = await resolveSuiteBinding(propertyId);
  if (resolved.kind === "none") {
    return NextResponse.json({
      results: rows.map((r) => ({ slug: r.slug, suiteRoomId: r.suiteRoomId, ok: false, reason: "no backend connected" })),
    });
  }

  const checkIn = isoDay(7);
  const checkOut = isoDay(8);
  const results = await checkRoomMappings(rows, async (suiteRoomId) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        `${resolved.baseUrl}/api/rooms/${encodeURIComponent(suiteRoomId)}/availability?checkIn=${checkIn}&checkOut=${checkOut}`,
        {
          headers: {
            ...(resolved.secret ? { Authorization: `Bearer ${resolved.secret}` } : {}),
            "X-Concierge-Suite-Version": String(resolved.version),
          },
          signal: controller.signal,
        }
      );
      if (res.status === 404) return { ok: false, reason: "room not found on backend (404)" };
      if (!res.ok) return { ok: false, reason: `backend answered ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "probe failed" };
    } finally {
      clearTimeout(timer);
    }
  });
  return NextResponse.json({ results });
}
