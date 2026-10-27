// Widget token handshake (step 4.5). This is the enforcement point
// for approved domains. widget.js calls this from the host page, so
// the browser attaches the host page's Origin header — the one header
// a website cannot fake for its own visitors. The server checks that
// origin's host against the approved list for the widget key's
// property, and only then returns a short-lived signed token.
//   POST { key } -> { token }  (403 when the site is not approved)
// The response carries CORS headers for exactly the requesting origin
// (never *), because the caller is cross-origin by design. An OPTIONS
// preflight is answered the same way. A missing or unparseable Origin
// is denied: a real browser embed always sends one.

import { NextRequest, NextResponse } from "next/server";
import { getWidgetProperty } from "@/demo-config/widget-keys";
import { createChatToken } from "@/lib/auth";
import { hostnameFromOrigin, isDomainApproved } from "@/lib/domains";

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  const hostname = hostnameFromOrigin(origin);
  if (!hostname) {
    return NextResponse.json(
      { error: "This site is not approved to host this chat." },
      { status: 403, headers }
    );
  }
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  const property = getWidgetProperty(key);
  if (!property) {
    return NextResponse.json({ error: "Unknown widget key." }, { status: 403, headers });
  }
  if (!(await isDomainApproved(property.propertyId, hostname))) {
    return NextResponse.json(
      { error: "This site is not approved to host this chat." },
      { status: 403, headers }
    );
  }
  const token = createChatToken({
    propertyId: property.propertyId,
    scope: "widget",
    domain: hostname,
  });
  if (!token) {
    return NextResponse.json({ error: "Chat is not configured." }, { status: 500, headers });
  }
  return NextResponse.json({ token }, { headers });
}
