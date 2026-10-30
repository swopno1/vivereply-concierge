// Onboarding admin API: status + submit (RAG engine, session only; owners
// act only for their own property).
//   GET  ?propertyId= -> { profile, run } (either may be null)
//   POST -> { propertyId, profile, website?, filePaths[] } validates,
//     enforces the once-only gate, upserts the profile, (re)starts the run,
//     and invokes the cloud worker (best-effort: without worker config the
//     run waits as PENDING and /invoke retries later).
// Static budget caps are enforced here; dynamic ones (chars, tokens) are
// enforced by the worker + callback, which abort to PARTIAL.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { ONBOARDING_BUDGET, sanitizeFilename } from "@/lib/onboarding";
import { cleanSegmentIds } from "@/lib/segments";
import { signDownloadUrl, signUploadUrl } from "@/lib/storage";
import { invokeIngestionWorker } from "@/lib/worker";

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function optStr(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return str(value, max);
}

function cleanWebsite(value: unknown): string | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  if (trimmed.length > 500) return "invalid";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "invalid";
    return trimmed;
  } catch {
    return "invalid";
  }
}

function shapeRun(run: {
  id: string;
  propertyId: string;
  status: string;
  filePaths: string[];
  website: string | null;
  stats: unknown;
  error: string | null;
  approvedRerun: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: run.id,
    propertyId: run.propertyId,
    status: run.status,
    filePaths: run.filePaths,
    website: run.website,
    stats: run.stats,
    error: run.error,
    approvedRerun: run.approvedRerun,
    approvedBy: run.approvedBy,
    approvedAt: run.approvedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
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
  const [profile, run] = await Promise.all([
    prisma.propertyProfile.findUnique({ where: { propertyId } }),
    prisma.onboardingRun.findUnique({ where: { propertyId } }),
  ]);
  return NextResponse.json({ profile, run: run ? shapeRun(run) : null });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = str(body?.propertyId, 100);
  const profile = (body?.profile ?? {}) as Record<string, unknown>;
  const businessName = str(profile.businessName, 150);
  if (!propertyId) {
    return NextResponse.json({ error: "Property ID is required (max 100 characters)." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  if (!businessName) {
    return NextResponse.json({ error: "Business name is required (max 150 characters)." }, { status: 400 });
  }
  const website = cleanWebsite(body?.website ?? profile.website);
  if (website === "invalid") {
    return NextResponse.json({ error: "Website must be an http(s) URL." }, { status: 400 });
  }
  const filePaths = Array.isArray(body?.filePaths) ? body.filePaths : [];
  if (filePaths.length > ONBOARDING_BUDGET.maxFiles) {
    return NextResponse.json(
      { error: `At most ${ONBOARDING_BUDGET.maxFiles} files per run.` },
      { status: 400 }
    );
  }
  const safeProp = propertyId.replace(/[^a-zA-Z0-9-]+/g, "_").slice(0, 80);
  for (const p of filePaths) {
    if (typeof p !== "string" || !p.startsWith(`${safeProp}/`)) {
      return NextResponse.json({ error: "File paths must come from this property's uploads." }, { status: 400 });
    }
    const filename = p.slice(safeProp.length + 1).replace(/^\d+-/, "");
    if (!sanitizeFilename(filename)) {
      return NextResponse.json({ error: `Rejected upload filename in ${p}.` }, { status: 400 });
    }
  }
  if (!website && filePaths.length === 0) {
    return NextResponse.json(
      { error: "Give a website, upload at least one document, or both — otherwise there is nothing to ingest." },
      { status: 400 }
    );
  }
  const languages = Array.isArray(profile.languages)
    ? profile.languages.filter((l): l is string => typeof l === "string").map((l) => l.trim().slice(0, 30)).filter(Boolean).slice(0, 5)
    : [];
  const profileData = {
    businessName,
    address: optStr(profile.address, 300),
    phone: optStr(profile.phone, 50),
    email: optStr(profile.email, 150),
    website,
    assistantName: optStr(profile.assistantName, 100),
    tone: optStr(profile.tone, 500),
    languages,
    greeting: optStr(profile.greeting, 500),
    suggestionSegments: cleanSegmentIds(profile.suggestionSegments),
  };

  const existing = await prisma.onboardingRun.findUnique({ where: { propertyId } });
  if (existing && !existing.approvedRerun) {
    return NextResponse.json(
      {
        error: "This property already used its one ingestion run. An admin approval unlocks exactly one more.",
        needsApproval: true,
      },
      { status: 409 }
    );
  }

  await prisma.propertyProfile.upsert({
    where: { propertyId },
    create: { propertyId, ...profileData },
    update: profileData,
  });

  let run;
  if (existing) {
    run = await prisma.onboardingRun.update({
      where: { propertyId },
      data: {
        status: "PENDING",
        filePaths,
        website,
        stats: Prisma.JsonNull,
        error: null,
        approvedRerun: false,
      },
    });
  } else {
    run = await prisma.onboardingRun.create({
      data: { propertyId, status: "PENDING", filePaths, website },
    });
  }

  let files: { path: string; downloadUrl: string }[] = [];
  try {
    files = await Promise.all(
      filePaths.map(async (p: string) => ({ path: p, downloadUrl: await signDownloadUrl(p) }))
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not sign uploads.";
    await prisma.onboardingRun.update({ where: { id: run.id }, data: { error } });
    return NextResponse.json({ run: shapeRun({ ...run, error }), worker: { invoked: false, note: error } });
  }
  // Raw-bundle signing is best-effort: without it the worker skips the
  // audit bundle but the run still proceeds (website-only runs especially).
  let storageHost = "";
  let rawUploadUrl: string | null = null;
  try {
    storageHost = new URL(process.env.SUPABASE_URL ?? "").hostname;
    rawUploadUrl = await signUploadUrl(`raw/${safeProp}/${run.id}.json`);
  } catch {
    storageHost = "";
    rawUploadUrl = null;
  }
  let worker = { invoked: false, note: "Worker not configured — run stays queued." };
  try {
    worker = await invokeIngestionWorker({ runId: run.id, propertyId, website, files, storageHost, rawUploadUrl });
    await prisma.onboardingRun.update({
      where: { id: run.id },
      data: { status: worker.invoked ? "RUNNING" : "PENDING" },
    });
  } catch (e) {
    worker = { invoked: false, note: e instanceof Error ? e.message : "Worker invoke failed." };
  }
  const fresh = await prisma.onboardingRun.findUnique({ where: { propertyId } });
  return NextResponse.json({ run: fresh ? shapeRun(fresh) : shapeRun(run), worker });
}
