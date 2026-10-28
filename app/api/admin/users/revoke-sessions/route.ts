// Session revoke API (auth Tier 1, SUPER_ADMIN only).
//   POST /api/admin/users/revoke-sessions { id } -> { sessionsRevoked }
// Signs a login out on every device at once (the row behind each cookie is
// revoked, so all of them die on next use). Owners sign out one device via
// logout; this is the admin kill switch.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, revokeUserSessions } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the Vivereply team can revoke sessions." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "Login not found." }, { status: 404 });
  }
  const sessionsRevoked = await revokeUserSessions(id);
  return NextResponse.json({ id, sessionsRevoked });
}
