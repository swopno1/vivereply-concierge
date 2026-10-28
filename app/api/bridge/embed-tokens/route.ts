// Bridge API: mint a staff-embed token (server-to-server ONLY).
//   POST /api/bridge/embed-tokens { origin } -> { token, expiresAt }
// Auth: Authorization: Bearer <bridge key> — embed tokens can NEVER mint
// (no chaining). The client dashboard calls this from its SERVER on each
// page load, then renders <iframe src="…/staff/embed?token=…">. The token
// lives 15 minutes, covers exactly the key's property, and is bound to the
// dashboard origin (enforced at iframe load via Referer). The bridge key
// itself must never reach the browser.

import { NextRequest, NextResponse } from "next/server";
import { cleanEmbedOrigin, verifyBridgeKey } from "@/lib/bridge";
import { createEmbedToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await verifyBridgeKey(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing bridge key." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const origin = cleanEmbedOrigin(body?.origin);
  if (!origin) {
    return NextResponse.json(
      { error: "Origin must be a full https origin, e.g. https://dashboard.example.com." },
      { status: 400 }
    );
  }
  const token = createEmbedToken({ propertyId: auth.propertyId, origin });
  if (!token) {
    return NextResponse.json({ error: "Embed tokens are not configured." }, { status: 500 });
  }
  return NextResponse.json(
    { token, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
    { status: 201 }
  );
}
