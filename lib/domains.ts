// Approved-domain checks (step 4.5). A domain is approved when an
// admin added it in /admin for that property and it is still active.
// Hostnames are compared exactly (lowercased, no port, no scheme):
// demo1.vivereply.com does not approve www.demo1.vivereply.com or
// evil-demo1.vivereply.com — the admin must add each host explicitly.
//
// Development exception, and only in development: localhost is
// approved automatically so local widget testing still works without
// seeding a domain row. In production (NODE_ENV=production) there is
// no exception — only the approved list counts.

import { prisma } from "@/lib/prisma";

export function normalizeHostname(raw: string): string | null {
  const host = raw.trim().toLowerCase();
  if (!host || host.includes("://") || host.includes("/") || host.includes(" ")) return null;
  const withoutPort = host.split(":")[0];
  if (!withoutPort || withoutPort.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(withoutPort)) {
    return null;
  }
  return withoutPort;
}

export async function isDomainApproved(propertyId: string, hostname: string): Promise<boolean> {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  if (process.env.NODE_ENV !== "production" && normalized === "localhost") return true;
  const row = await prisma.approvedDomain.findFirst({
    where: { domain: normalized, propertyId, active: true },
  });
  return row !== null;
}

export function hostnameFromOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}
