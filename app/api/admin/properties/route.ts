// Property registration API (auth Tier 1, SUPER_ADMIN only).
//   POST /api/admin/properties { id, name, widgetKey, domains[], ownerEmail }
// Registers a tenant the routine way (the seed file stays as the
// bootstrap/disaster-recovery path): Property row + approved domains +
// OWNER user with a temporary password. The temp password returns ONCE in
// this response — it is never stored or shown again, and the owner must
// replace it (banner + Settings form) before it counts as theirs.
// Refuses duplicates (property id, widget key) with 409s. An EXISTING
// owner email grows that owner's portfolio instead of 409ing — but only
// on Scale and under the 3-property limit (403 otherwise): the new
// property links via ownerEmail, gets its own trial row, and reuses the
// existing login (tempPassword null). Until owner multi-property
// management ships, linked properties 2–3 are founder-managed.
//   PATCH /api/admin/properties { id, status } — suspend (INACTIVE) or
// resume (ACTIVE) a tenant. Suspension is the kill-switch: widget
// issuance, chat, bridge keys, and owner sessions all refuse a
// non-ACTIVE property on next use (see isPropertyActive).

import { NextRequest, NextResponse } from "next/server";
// SERVICE PATH (marked): tenant registration + suspension span tenants
// (and creation precedes any tenant) — bypass by design.
import { prismaService } from "@/lib/prisma";
import {
  generateTempPassword,
  hashPassword,
  isValidEmail,
  isValidSlug,
} from "@/lib/auth";
import { getSession } from "@/lib/tenant";
import { normalizeHostname } from "@/lib/domains";
import { clientIp, logAudit } from "@/lib/audit";
import {
  PropertyLimitError,
  TRIAL_DAYS,
  TRIAL_TIER,
  countPropertiesForOwner,
  creationAllowed,
} from "@/lib/billing";

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

  const [dupId, dupKey, existingUser] = await Promise.all([
    prismaService().property.findUnique({ where: { id } }),
    prismaService().property.findUnique({ where: { widgetKey } }),
    prismaService().user.findUnique({ where: { email: ownerEmail } }),
  ]).catch(() => [null, null, null]);
  if (dupId) {
    return NextResponse.json({ error: "That property ID is already registered." }, { status: 409 });
  }
  if (dupKey) {
    return NextResponse.json({ error: "That widget key is already taken." }, { status: 409 });
  }
  // Existing email: only an ACTIVE owner login can grow a portfolio —
  // any other holder (super-admin row, deactivated) stays a duplicate.
  const reuseLogin = !!existingUser;
  if (existingUser && (existingUser.role !== "OWNER" || !existingUser.active || !existingUser.propertyId)) {
    return NextResponse.json({ error: "That email already owns a login." }, { status: 409 });
  }

  const tempPassword = reuseLogin ? null : generateTempPassword();
  const passwordHash = tempPassword ? await hashPassword(tempPassword) : null;
  try {
    // Callback-form tx: the limit check (count + tier read) and the
    // creates are atomic — a refusal rolls back with zero rows. A
    // concurrent creation racing us can still slip one extra row past
    // the count (no row lock; accepted, see PR).
    await prismaService().$transaction(async (tx) => {
      const owned = await countPropertiesForOwner(tx, ownerEmail);
      let ownerTier: string | null = null;
      if (reuseLogin && existingUser?.propertyId) {
        const ownerSub = await tx.subscription.findUnique({
          where: { propertyId: existingUser.propertyId },
        });
        ownerTier = ownerSub?.tier ?? null;
      }
      if (!creationAllowed(ownerTier, owned)) throw new PropertyLimitError(ownerTier);
      await tx.property.create({
        data: { id, name, widgetKey, status: "ACTIVE", ownerEmail },
      });
      await tx.subscription.create({
        data: {
          propertyId: id,
          tier: TRIAL_TIER,
          interval: "MONTHLY",
          status: "TRIAL",
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        },
      });
      for (const domain of domains) {
        await tx.approvedDomain.create({ data: { domain, propertyId: id, active: true } });
      }
      if (!reuseLogin && passwordHash) {
        await tx.user.create({
          // Team-registered: email attested, verified at creation (see schema).
          data: { email: ownerEmail, passwordHash, role: "OWNER", propertyId: id, active: true, mustChangePassword: true, emailVerifiedAt: new Date() },
        });
      }
    });
  } catch (e) {
    if (e instanceof PropertyLimitError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Registration failed (likely a duplicate). Try again." }, { status: 409 });
  }
  // New login: the temp password travels here once, in this response
  // body, over the super-admin's own TLS session — never logged,
  // never stored. Reused login: tempPassword is null (no new secret;
  // the owner keeps their existing password).
  return NextResponse.json(
    { propertyId: id, ownerEmail, tempPassword, ...(reuseLogin ? { existingLogin: true } : {}) },
    { status: 201 }
  );
}

const SUSPEND_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the Vivereply team can suspend properties." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const status = body?.status;
  if (!id) {
    return NextResponse.json({ error: "Property id is required." }, { status: 400 });
  }
  if (!SUSPEND_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Status must be ACTIVE or INACTIVE." }, { status: 400 });
  }
  const row = await prismaService().property.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  await prismaService().property.update({ where: { id }, data: { status } });
  await logAudit({
    actorEmail: session.email,
    action: status === "ACTIVE" ? "property.resume" : "property.suspend",
    propertyId: id,
    ip: clientIp(req),
  });
  return NextResponse.json({ id, status });
}
