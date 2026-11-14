// Property switcher API (D1 dashboard). OWNER-only: verifies the target
// property belongs to this owner (ownerEmail match or the session's own
// row), persists it as lastPropertyId, and re-mints the signed session
// cookie scoped to it — every per-property page re-scopes on next load
// through the existing tenant context. Anything unverifiable fails
// closed with 403/404 and the session keeps its current property.
//   POST -> { propertyId }
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/tenant";
import { setSessionCookie } from "@/lib/auth";
import { switchOwnerProperty } from "@/lib/dashboard";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "OWNER") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  if (!propertyId || propertyId.length > 100) {
    return NextResponse.json({ error: "Property ID is required (max 100 characters)." }, { status: 400 });
  }
  const switched = await switchOwnerProperty(session, propertyId);
  if (!switched) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true, propertyId: switched.propertyId });
  setSessionCookie(res, switched.token);
  return res;
}
