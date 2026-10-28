// Onboarding worker re-invoke (RAG engine, admin session only).
//   POST /api/admin/onboarding/invoke { propertyId }
// Re-sends a PENDING run to the cloud worker — for when the worker was
// configured after submit, or a previous invoke failed. Anything past
// PENDING is rejected: rerunning real work goes through the approval flip.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { signDownloadUrl } from "@/lib/storage";
import { invokeIngestionWorker } from "@/lib/worker";

export async function POST(req: NextRequest) {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  if (!propertyId) {
    return NextResponse.json({ error: "Property ID is required." }, { status: 400 });
  }
  const run = await prisma.onboardingRun.findUnique({ where: { propertyId } });
  if (!run) {
    return NextResponse.json({ error: "No onboarding run exists for this property yet." }, { status: 404 });
  }
  if (run.status !== "PENDING") {
    return NextResponse.json(
      { error: `Only PENDING runs can be re-invoked (this one is ${run.status}).` },
      { status: 409 }
    );
  }
  try {
    const files = await Promise.all(
      run.filePaths.map(async (path) => ({ path, downloadUrl: await signDownloadUrl(path) }))
    );
    const worker = await invokeIngestionWorker({
      runId: run.id,
      propertyId,
      website: run.website,
      files,
    });
    if (worker.invoked) {
      await prisma.onboardingRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });
    }
    return NextResponse.json({ invoked: worker.invoked, note: worker.note });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invoke failed." },
      { status: 500 }
    );
  }
}
