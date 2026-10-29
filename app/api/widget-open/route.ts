// Widget-open beacon (funnel metrics). widget.js fires this (sendBeacon,
// fire-and-forget) every time a guest OPENS the panel — page loads
// don't count (the token handshake happens on load, the open happens
// on tap). Always answers 200: unknown keys are ignored silently, so
// the beacon never leaks key validity and never disturbs the chat.
// Stores property + timestamp only — no IP, no UA, no identity.
import { NextRequest, NextResponse } from "next/server";
import { resolveWidgetProperty } from "@/demo-config/widget-keys";
import { prisma } from "@/lib/prisma";

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
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  if (key) {
    const property = await resolveWidgetProperty(key).catch(() => null);
    if (property) {
      await prisma.widgetOpen.create({ data: { propertyId: property.propertyId } }).catch(() => null);
    }
  }
  return NextResponse.json({ ok: true }, { headers });
}
