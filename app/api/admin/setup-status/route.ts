// Setup-status read API: the wizard's live checks. Owners see their
// own property; super-admins pass ?propertyId=. Returns the derived
// state (steps + facts) — names, counts, and outcomes only, never
// secrets (hasSecret boolean at most).
import { NextRequest, NextResponse } from "next/server";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { deriveSetupState, getSetupFacts } from "@/lib/setup";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const propertyId =
    session.role === "OWNER"
      ? (session.propertyId ?? "")
      : req.nextUrl.searchParams.get("propertyId")?.trim() ?? "";
  if (!propertyId || !sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  const facts = await getSetupFacts(propertyId, await sessionOwnerVerified(session));
  if (!facts) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  return NextResponse.json(deriveSetupState(facts));
}
