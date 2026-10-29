// Integration status API (owner Settings banner).
//   GET /api/admin/integration/status?propertyId=<id>
// Reports which backend + catalogue actually serve a property and which
// layer each comes from — the owner's answer to "is my system live, or
// the demo default?" Never returns secrets (base URL only). Session +
// tenant + verification gated like every other owner admin route.

import { NextRequest, NextResponse } from "next/server";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { describeBackendResolution } from "@/lib/suite";
import { describeCatalogueResolution } from "@/demo-config/rooms";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "";
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  const [backend, catalogue] = await Promise.all([
    describeBackendResolution(propertyId),
    describeCatalogueResolution(propertyId),
  ]);
  return NextResponse.json({ backend, catalogue });
}
