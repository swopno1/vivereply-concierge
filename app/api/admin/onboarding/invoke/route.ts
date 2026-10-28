// Onboarding worker re-invoke (RAG engine, session only; owners re-invoke
// only their own property's run).
//   POST /api/admin/onboarding/invoke { propertyId }
// Re-sends a PENDING run to the cloud worker — for when the worker was
// configured after submit, or a previous invoke failed. Anything past
// PENDING is rejected: rerunning real work goes through the approval flip.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan } from "@/lib/tenant";
import { signDownloadUrl, signUploadUrl } from "@/lib/storage";
import { invokeIngestionWorker } from "@/lib/worker";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  if (!propertyId) {
    return NextResponse.json({ error: "Property ID is required." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
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
    const safeProp = propertyId.replace(/[^a-zA-Z0-9-]+/g, "_").slice(0, 80);
    let storageHost = "";
    let rawUploadUrl: string | null = null;
    try {
      storageHost = new URL(process.env.SUPABASE_URL ?? "").hostname;
      rawUploadUrl = await signUploadUrl(`raw/${safeProp}/${run.id}.json`);
    } catch {
      storageHost = "";
      rawUploadUrl = null;
    }
    const worker = await invokeIngestionWorker({
      runId: run.id,
      propertyId,
      website: run.website,
      files,
      storageHost,
      rawUploadUrl,
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
