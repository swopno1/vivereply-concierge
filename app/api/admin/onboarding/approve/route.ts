// Onboarding re-run approval (RAG engine, SUPER_ADMIN only — owners must
// never approve their own reruns).
//   PATCH /api/admin/onboarding/approve { propertyId, approve: true, approvedBy }
// Unlocks exactly one more ingestion run for a property that already used
// its one. The flip is consumed by the next submit. approve: false revokes
// a pending approval. Who approved is recorded on the run row.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the Vivereply team can approve re-runs." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  const approve = body?.approve === true;
  if (!propertyId) {
    return NextResponse.json({ error: "Property ID is required." }, { status: 400 });
  }
  const run = await prisma.onboardingRun.findUnique({ where: { propertyId } });
  if (!run) {
    return NextResponse.json({ error: "No onboarding run exists for this property yet." }, { status: 404 });
  }
  if (!approve) {
    await prisma.onboardingRun.update({
      where: { propertyId },
      data: { approvedRerun: false, approvedBy: null, approvedAt: null },
    });
    return NextResponse.json({ approvedRerun: false });
  }
  const approvedBy = typeof body?.approvedBy === "string" ? body.approvedBy.trim() : "";
  if (!approvedBy || approvedBy.length > 100) {
    return NextResponse.json({ error: "Approver name is required (max 100 characters)." }, { status: 400 });
  }
  await prisma.onboardingRun.update({
    where: { propertyId },
    data: { approvedRerun: true, approvedBy, approvedAt: new Date() },
  });
  return NextResponse.json({ approvedRerun: true, approvedBy });
}
