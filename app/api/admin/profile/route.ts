// Chatbot profile API (owner self-service). The onboarding run sets the
// profile once; this endpoint lets owners rename their chatbot and flip
// suggestion segments afterwards without re-running ingestion.
//   PATCH -> { propertyId, assistantName?, greeting?, tone?, suggestionSegments? }
// Names are plain text (max 100); segment ids outside lib/segments are
// dropped, never stored. Upserts: a property without a profile row gets
// one (business name falls back to the property name).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { cleanSegmentIds } from "@/lib/segments";

function optStr(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
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
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  if (!propertyId || propertyId.length > 100) {
    return NextResponse.json({ error: "Property ID is required (max 100 characters)." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  const data = {
    assistantName: optStr(body?.assistantName, 100),
    greeting: optStr(body?.greeting, 500),
    tone: optStr(body?.tone, 500),
    suggestionSegments: cleanSegmentIds(body?.suggestionSegments),
  };
  const row = await prisma.propertyProfile.upsert({
    where: { propertyId },
    create: { propertyId, businessName: property.name, ...data },
    update: data,
  });
  return NextResponse.json({
    propertyId: row.propertyId,
    assistantName: row.assistantName,
    greeting: row.greeting,
    tone: row.tone,
    suggestionSegments: row.suggestionSegments,
  });
}
