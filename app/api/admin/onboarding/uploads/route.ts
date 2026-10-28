// Onboarding upload signing (RAG engine, session only; owners sign uploads
// only under their own property's prefix).
//   POST /api/admin/onboarding/uploads { propertyId, filename, size }
//     -> { path, uploadUrl } (PUT the file bytes there within the hour)
// Enforces the extension allowlist + per-file size cap. The browser uploads
// straight to Supabase Storage — file bytes never transit Vercel.

import { NextRequest, NextResponse } from "next/server";
import { getSession, sessionCan } from "@/lib/tenant";
import { ONBOARDING_BUDGET, sanitizeFilename, storagePath } from "@/lib/onboarding";
import { signUploadUrl } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  const filename = sanitizeFilename(typeof body?.filename === "string" ? body.filename : "");
  const size = body?.size;
  if (!propertyId || propertyId.length > 100) {
    return NextResponse.json({ error: "Property ID is required (max 100 characters)." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  if (!filename) {
    return NextResponse.json(
      { error: "Filename must have an allowed extension (pdf, md, txt, xlsx, xls, docx, csv, markdown)." },
      { status: 400 }
    );
  }
  if (typeof size !== "number" || size <= 0 || size > ONBOARDING_BUDGET.maxFileBytes) {
    return NextResponse.json(
      { error: `Each file must be under ${ONBOARDING_BUDGET.maxFileBytes / 1024 / 1024}MB.` },
      { status: 400 }
    );
  }
  const path = storagePath(propertyId, filename);
  try {
    const uploadUrl = await signUploadUrl(path);
    return NextResponse.json({ path, uploadUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not sign upload." },
      { status: 500 }
    );
  }
}
