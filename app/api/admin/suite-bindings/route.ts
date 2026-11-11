// Suite-binding admin API (adapter Phase 2, multi-tenant core). Every method
// requires the session cookie; owners see and touch only their own
// property's rows. One binding per property.
//   GET    -> [{ id, propertyId, suiteBaseUrl, paymentPageUrl, version,
//                secretSet, lastTestedAt, lastTestOk, createdAt }] (never secrets)
//   POST   -> { propertyId, suiteBaseUrl, secret?, paymentPageUrl? } creates (409 on dup)
//   PATCH  -> { id, suiteBaseUrl?, secret?, paymentPageUrl? } updates;
//             secret "" clears, paymentPageUrl "" clears
//   DELETE -> { id } removes the row (chat falls back to env for demo)
// URL rule: http(s) only. Secret rule: stored encrypted, shown nowhere.
// Payment-page rule: the resort's OWN pay page (owner-configured); the
// bot deep-links it with ?booking=CODE. Concierge never takes resort
// money — this URL only points at the cash counter.

import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaService } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";
import { tenantFor, withTenant } from "@/lib/tenant-db";
import { encryptSecret } from "@/lib/secrets";
import { clientIp, logAudit } from "@/lib/audit";
import { cleanPaymentPageUrl } from "@/lib/resort-pay";

function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/$/, "");
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Production guardrail (adapter Phase 4): bindings point at real backends.
  // Plain http and loopback survive only in development, for stub testing.
  if (process.env.NODE_ENV === "production") {
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return null;
    }
  }
  return trimmed;
}

function shape(row: {
  id: string;
  propertyId: string;
  suiteBaseUrl: string;
  paymentPageUrl: string | null;
  version: number;
  secretEnc: string | null;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    suiteBaseUrl: row.suiteBaseUrl,
    paymentPageUrl: row.paymentPageUrl,
    version: row.version,
    secretSet: row.secretEnc !== null,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  // Owners list their own rows (tenant path); super-admins list across
  // properties (SERVICE PATH, marked).
  const tenant = tenantFor(session);
  if (session.role === "OWNER" && !tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const rows = tenant
    ? await withTenant(tenant, (tx) =>
        tx.propertyBinding.findMany({
          where: { propertyId: tenant },
          orderBy: { createdAt: "asc" },
        })
      )
    : await prismaService().propertyBinding.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(rows.map(shape));
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
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  const suiteBaseUrl = cleanUrl(body?.suiteBaseUrl);
  const secret = typeof body?.secret === "string" ? body.secret : "";
  if (!propertyId || propertyId.length > 100) {
    return NextResponse.json({ error: "Property ID is required (max 100 characters)." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  if (!suiteBaseUrl) {
    return NextResponse.json(
      { error: "Base URL must be https in production (http loopback allowed in development only)." },
      { status: 400 }
    );
  }
  let paymentPageUrl: string | null = null;
  if (body?.paymentPageUrl !== undefined && body.paymentPageUrl !== "" && body.paymentPageUrl !== null) {
    paymentPageUrl = cleanPaymentPageUrl(body.paymentPageUrl);
    if (!paymentPageUrl) {
      return NextResponse.json(
        { error: "Payment page must be a valid https URL (http loopback allowed in development only)." },
        { status: 400 }
      );
    }
  }
  const tenant = tenantFor(session, propertyId);
  if (!tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  // FK honesty: creating for a ghost property would 500 on the FK —
  // answer 404 instead.
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  const existing = await withTenant(tenant, (tx) =>
    tx.propertyBinding.findUnique({ where: { propertyId } })
  );
  if (existing) {
    return NextResponse.json(
      { error: "That property already has a binding — edit it instead." },
      { status: 409 }
    );
  }
  let secretEnc: string | null = null;
  if (secret) {
    try {
      secretEnc = encryptSecret(secret);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not store the secret." },
        { status: 500 }
      );
    }
  }
  const row = await withTenant(tenant, (tx) =>
    tx.propertyBinding.create({
      data: { propertyId, suiteBaseUrl, secretEnc, paymentPageUrl, version: 1 },
    })
  );
  // URL + whether a secret was set — never the secret itself.
  await logAudit({
    actorEmail: session.email,
    action: "binding.save",
    propertyId,
    detail: { suiteBaseUrl, hasSecret: secretEnc !== null, hasPaymentPage: paymentPageUrl !== null },
    ip: clientIp(req),
  });
  return NextResponse.json(shape(row), { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Binding id is required." }, { status: 400 });
  }
  // Look up first: a row from another property answers 404, never 403 —
  // the id alone must not reveal that the row exists. Owners read inside
  // their own tenant (RLS confines the lookup); super-admins read
  // cross-property (SERVICE PATH, marked).
  const tenant = tenantFor(session);
  if (session.role === "OWNER" && !tenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const current = tenant
    ? await withTenant(tenant, (tx) => tx.propertyBinding.findUnique({ where: { id } }))
    : await prismaService().propertyBinding.findUnique({ where: { id } });
  if (!current || !sessionCan(session, current.propertyId)) {
    return NextResponse.json({ error: "Binding not found." }, { status: 404 });
  }
  const updates: { suiteBaseUrl?: string; secretEnc?: string | null; paymentPageUrl?: string | null } = {};
  if (body?.suiteBaseUrl !== undefined) {
    const suiteBaseUrl = cleanUrl(body.suiteBaseUrl);
    if (!suiteBaseUrl) {
      return NextResponse.json(
        { error: "Base URL must be https in production (http loopback allowed in development only)." },
        { status: 400 }
      );
    }
    updates.suiteBaseUrl = suiteBaseUrl;
  }
  if (body?.secret !== undefined) {
    if (typeof body.secret !== "string") {
      return NextResponse.json({ error: "Secret must be a string (empty clears it)." }, { status: 400 });
    }
    if (body.secret) {
      try {
        updates.secretEnc = encryptSecret(body.secret);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Could not store the secret." },
          { status: 500 }
        );
      }
    } else {
      updates.secretEnc = null;
    }
  }
  if (body?.paymentPageUrl !== undefined) {
    if (body.paymentPageUrl === "" || body.paymentPageUrl === null) {
      updates.paymentPageUrl = null;
    } else {
      const page = cleanPaymentPageUrl(body.paymentPageUrl);
      if (!page) {
        return NextResponse.json(
          { error: "Payment page must be a valid https URL (http loopback allowed in development only)." },
          { status: 400 }
        );
      }
      updates.paymentPageUrl = page;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const row = tenant
    ? await withTenant(tenant, (tx) => tx.propertyBinding.update({ where: { id }, data: updates })).catch(() => null)
    : await prismaService().propertyBinding.update({ where: { id }, data: updates }).catch(() => null);
  if (!row) {
    return NextResponse.json({ error: "Binding not found." }, { status: 404 });
  }
  await logAudit({
    actorEmail: session.email,
    action: "binding.edit",
    propertyId: current.propertyId,
    detail: {
      ...(updates.suiteBaseUrl !== undefined ? { suiteBaseUrl: updates.suiteBaseUrl } : {}),
      ...("secretEnc" in updates ? { secret: updates.secretEnc === null ? "cleared" : "rotated" } : {}),
      ...("paymentPageUrl" in updates ? { paymentPage: updates.paymentPageUrl ?? "cleared" } : {}),
    },
    ip: clientIp(req),
  });
  return NextResponse.json(shape(row));
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to configure your resort." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Binding id is required." }, { status: 400 });
  }
  const delTenant = tenantFor(session);
  if (session.role === "OWNER" && !delTenant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const current = delTenant
    ? await withTenant(delTenant, (tx) => tx.propertyBinding.findUnique({ where: { id } }))
    : await prismaService().propertyBinding.findUnique({ where: { id } });
  if (!current || !sessionCan(session, current.propertyId)) {
    return NextResponse.json({ error: "Binding not found." }, { status: 404 });
  }
  if (delTenant) {
    await withTenant(delTenant, (tx) => tx.propertyBinding.delete({ where: { id } }));
  } else {
    await prismaService().propertyBinding.delete({ where: { id } });
  }
  await logAudit({
    actorEmail: session.email,
    action: "binding.remove",
    propertyId: current.propertyId,
    detail: { suiteBaseUrl: current.suiteBaseUrl },
    ip: clientIp(req),
  });
  return NextResponse.json({ deleted: true, propertyId: current.propertyId });
}
