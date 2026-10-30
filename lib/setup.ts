// Base-setup state (self-service third-party integration). Progress is
// DERIVED from existing rows — domains, binding + test stamps, room
// mappings, widget-open beacons, bridge keys — so an owner can leave
// and resume with no extra table, and no step can ever claim "done"
// without its live check passing. Pure derive + server gather share
// this module; the client wizard only ever sees the derived JSON.

import { prisma } from "@/lib/prisma";

export type SetupFacts = {
  propertyId: string;
  propertyName: string;
  widgetKey: string;
  emailVerified: boolean;
  activeDomains: string[];
  binding: null | {
    suiteBaseUrl: string;
    hasSecret: boolean;
    lastTestedAt: string | null;
    lastTestOk: boolean | null;
  };
  roomCount: number;
  opensTotal: number;
  lastOpenedAt: string | null;
  bridgeActiveCount: number;
};

export type SetupStep = {
  id: "account" | "property" | "domain" | "widget" | "booking" | "bridge";
  title: string;
  status: "done" | "pending" | "optional";
  detail: string;
};

export type SetupState = {
  facts: SetupFacts;
  steps: SetupStep[];
  complete: boolean;
};

export function deriveSetupState(facts: SetupFacts): SetupState {
  const steps: SetupStep[] = [
    {
      id: "account",
      title: "Account + verified email",
      status: facts.emailVerified ? "done" : "pending",
      detail: facts.emailVerified
        ? "Email verified — configuration is unlocked."
        : "Click the verification link in your signup email first.",
    },
    {
      id: "property",
      title: "Property + widget key",
      status: "done",
      detail: `Property ${facts.propertyId} · key ${facts.widgetKey}`,
    },
    {
      id: "domain",
      title: "Website domain approved",
      status: facts.activeDomains.length > 0 ? "done" : "pending",
      detail:
        facts.activeDomains.length > 0
          ? `Active: ${facts.activeDomains.join(", ")}`
          : "Add your website host below — unlisted hosts get nothing.",
    },
    {
      id: "widget",
      title: "Widget loading on your site",
      status: facts.opensTotal > 0 ? "done" : "pending",
      detail:
        facts.opensTotal > 0
          ? `${facts.opensTotal} panel open(s) seen${facts.lastOpenedAt ? `, latest ${facts.lastOpenedAt}` : ""}.`
          : "Paste the snippet, open the chat panel on your site once, then re-check.",
    },
    {
      id: "booking",
      title: "Booking backend connected + tested",
      status:
        facts.binding && facts.binding.lastTestOk === true && facts.roomCount > 0
          ? "done"
          : "pending",
      detail: !facts.binding
        ? "Save your Suite connection in Settings first."
        : facts.binding.lastTestOk !== true
          ? "Saved — press Test connection in Settings until it answers."
          : facts.roomCount === 0
            ? "Backend answers — now add rooms (no row, no quote)."
            : `Live: ${facts.binding.suiteBaseUrl} · ${facts.roomCount} room(s).`,
    },
    {
      id: "bridge",
      title: "Bridge key for staff API (optional)",
      status: facts.bridgeActiveCount > 0 ? "done" : "optional",
      detail:
        facts.bridgeActiveCount > 0
          ? `${facts.bridgeActiveCount} active key(s).`
          : "Optional — needed only if your own servers will work handoffs.",
    },
  ];
  const complete = steps
    .filter((s) => s.id !== "bridge")
    .every((s) => s.status === "done");
  return { facts, steps, complete };
}

export async function getSetupFacts(
  propertyId: string,
  emailVerified: boolean
): Promise<SetupFacts | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, widgetKey: true },
  });
  if (!property) return null;
  const [domains, binding, roomCount, opensTotal, lastOpen, bridgeActiveCount] = await Promise.all([
    prisma.approvedDomain.findMany({
      where: { propertyId, active: true },
      select: { domain: true },
      orderBy: { domain: "asc" },
    }),
    prisma.propertyBinding.findUnique({
      where: { propertyId },
      select: { suiteBaseUrl: true, secretEnc: true, lastTestedAt: true, lastTestOk: true },
    }),
    prisma.roomMapping.count({ where: { propertyId } }),
    prisma.widgetOpen.count({ where: { propertyId } }),
    prisma.widgetOpen.findFirst({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.bridgeToken.count({ where: { propertyId, active: true } }),
  ]);
  return {
    propertyId: property.id,
    propertyName: property.name,
    widgetKey: property.widgetKey,
    emailVerified,
    activeDomains: domains.map((d) => d.domain),
    binding: binding
      ? {
          suiteBaseUrl: binding.suiteBaseUrl,
          hasSecret: binding.secretEnc !== null,
          lastTestedAt: binding.lastTestedAt?.toISOString() ?? null,
          lastTestOk: binding.lastTestOk,
        }
      : null,
    roomCount,
    opensTotal,
    lastOpenedAt: lastOpen?.createdAt.toISOString() ?? null,
    bridgeActiveCount,
  };
}
