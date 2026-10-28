// User admin API (auth Tier 1, SUPER_ADMIN only).
//   PATCH /api/admin/users { id, active } -> toggles a login. Deactivating
//     also revokes every session, so the owner is out everywhere at once.
//     The bootstrap (env-password) super-admin has no row and cannot be
//     deactivated here — that password changes in the deployment env.
//     Deactivating your own row is allowed and locks you to the bootstrap
//     password: the recovery path, documented, not an accident.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, revokeUserSessions } from "@/lib/tenant";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the Vivereply team can manage logins." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const active = body?.active === true;
  if (!id) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "Login not found." }, { status: 404 });
  }
  await prisma.user.update({ where: { id }, data: { active } });
  let revoked = 0;
  if (!active) {
    revoked = await revokeUserSessions(id);
  }
  return NextResponse.json({ id, active, sessionsRevoked: revoked });
}
