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
  // Demo flag for owner copy: only the demo property falls back to the
  // demo default, so only it may be told so. Same comparison as the
  // resolvers above (lib/suite.ts, demo-config/rooms.ts).
  const isDemoProperty = propertyId === (process.env.DEMO_PROPERTY_ID ?? "krishnachura-retreat");
  return NextResponse.json({ backend, catalogue, isDemoProperty });
}
