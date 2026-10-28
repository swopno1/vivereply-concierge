// Property registration API (auth Tier 1, SUPER_ADMIN only).
//   POST /api/admin/properties { id, name, widgetKey, domains[], ownerEmail }
// Registers a tenant the routine way (the seed file stays as the
// bootstrap/disaster-recovery path): Property row + approved domains +
// OWNER user with a temporary password. The temp password returns ONCE in
// this response — it is never stored or shown again, and the owner must
// replace it (banner + Settings form) before it counts as theirs.
// Refuses duplicates (property id, widget key, owner email) with 409s.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateTempPassword,
  hashPassword,
  isValidEmail,
  isValidSlug,
} from "@/lib/auth";
import { getSession } from "@/lib/tenant";
import { normalizeHostname } from "@/lib/domains";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the Vivereply team can register properties." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const widgetKey = typeof body?.widgetKey === "string" ? body.widgetKey.trim() : "";
  const ownerEmail =
    typeof body?.ownerEmail === "string" ? body.ownerEmail.toLowerCase().trim() : "";
  const rawDomains = Array.isArray(body?.domains) ? body.domains : [];

  if (!isValidSlug(id)) {
    return NextResponse.json(
      { error: "Property ID must look like harbor-inn (lowercase, dashes, max 100)." },
      { status: 400 }
    );
  }
  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Name is required (max 100 characters)." }, { status: 400 });
  }
  if (!isValidSlug(widgetKey, 60)) {
    return NextResponse.json(
      { error: "Widget key must look like key-harbor-inn (lowercase, dashes, max 60)." },
      { status: 400 }
    );
  }
  if (!isValidEmail(ownerEmail)) {
    return NextResponse.json({ error: "A valid owner email is required." }, { status: 400 });
  }
  if (rawDomains.length > 10) {
    return NextResponse.json({ error: "At most 10 domains per registration." }, { status: 400 });
  }
  const domains: string[] = [];
  for (const d of rawDomains) {
    const host = normalizeHostname(typeof d === "string" ? d : "");
    if (!host) {
      return NextResponse.json(
        { error: "Domains must be bare hostnames (no scheme, port, or path)." },
        { status: 400 }
      );
    }
    domains.push(host);
  }

  const [dupId, dupKey, dupEmail] = await Promise.all([
    prisma.property.findUnique({ where: { id } }),
    prisma.property.findUnique({ where: { widgetKey } }),
    prisma.user.findUnique({ where: { email: ownerEmail } }),
  ]).catch(() => [null, null, null]);
  if (dupId) {
    return NextResponse.json({ error: "That property ID is already registered." }, { status: 409 });
  }
  if (dupKey) {
    return NextResponse.json({ error: "That widget key is already taken." }, { status: 409 });
  }
  if (dupEmail) {
    return NextResponse.json({ error: "That email already owns a login." }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  try {
    await prisma.$transaction([
      prisma.property.create({ data: { id, name, widgetKey, status: "ACTIVE" } }),
      ...domains.map((domain) =>
        prisma.approvedDomain.create({ data: { domain, propertyId: id, active: true } })
      ),
      prisma.user.create({
        data: { email: ownerEmail, passwordHash, role: "OWNER", propertyId: id, active: true, mustChangePassword: true },
      }),
    ]);
  } catch {
    return NextResponse.json({ error: "Registration failed (likely a duplicate). Try again." }, { status: 409 });
  }
  // The temp password travels here once, in this response body, over the
  // super-admin's own TLS session — never logged, never stored.
  return NextResponse.json({ propertyId: id, ownerEmail, tempPassword }, { status: 201 });
}
