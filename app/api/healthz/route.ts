// Liveness probe for uptime monitors (both sites).
//   GET /api/healthz -> { ok, commit, now }
//   GET /api/healthz?deep=1 -> + { db: "up" } (one SELECT 1; use
//   sparingly — monitors should hit the shallow form).
// No auth, no PII, no tenant data — safe to call from anywhere.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const body: { ok: boolean; commit: string; now: string; db?: string } = {
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    now: new Date().toISOString(),
  };
  if (req.nextUrl.searchParams.get("deep") === "1") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      body.db = "up";
    } catch {
      return NextResponse.json({ ...body, ok: false, db: "down" }, { status: 503 });
    }
  }
  return NextResponse.json(body);
}
