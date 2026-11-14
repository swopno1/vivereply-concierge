// Tenant dashboard data (Handover D1). Pure derivations (attention strip,
// first-run checklist, switch validation) live here beside their data
// loaders so the node --test suite can pin them without a database.
// Tenancy rules: every per-property read goes through withTenant with the
// session's verified property; the owner-property list and the switch
// itself are marked SERVICE PATHs (cross-property by definition, exact-id
// targeted, ownership verified before any write).

import { prismaService } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";
import { getBillingSnapshot, type BillingSnapshot } from "@/lib/billing";
import { BACKEND_FAILURE_TOOL_NAMES, isFailureOutput } from "@/lib/booking-mode";
import { createSessionToken, type Session } from "@/lib/auth";

/**
 * The session user's own 2FA state for the shell account block. Mirrors
 * the settings-page read: bootstrap reads the row setup creates for
 * ADMIN_EMAIL (absent = off); row users read their own row.
 */
export async function getOwnTwoFaEnabled(session: Pick<Session, "uid" | "email"> | null): Promise<boolean> {
  if (!session) return false;
  const db = prismaService();
  const row =
    session.uid === "bootstrap" && session.email
      ? await db.user
          .findUnique({ where: { email: session.email }, select: { totpSecretEnc: true, totpEnabledAt: true } })
          .catch(() => null)
      : session.uid === "bootstrap"
        ? null
        : await db.user
            .findUnique({ where: { id: session.uid }, select: { totpSecretEnc: true, totpEnabledAt: true } })
            .catch(() => null);
  return !!(row?.totpSecretEnc && row.totpEnabledAt);
}

export type AttentionItem = { id: string; text: string; href: string };

export type AttentionInput = {
  snapshot: BillingSnapshot | null;
};

/**
 * Home attention strip, one line per real condition. Billing-paused beats
 * trial-ending (an expired trial renders as the pause, not both). No
 * owner-pause state exists in D1 (no such primitive in the codebase —
 * reported in the D1 PR), so every item here routes to billing.
 */
export function attentionItems({ snapshot }: AttentionInput): AttentionItem[] {
  if (!snapshot || !snapshot.hasSubscription) return [];
  if (!snapshot.gate.allowed) {
    if (snapshot.gate.reason === "admin-hold") {
      return [
        {
          id: "paused",
          text: "Paused by ViveReply — contact support.",
          href: "/support",
        },
      ];
    }
    return [
      {
        id: "paused",
        text:
          snapshot.gate.reason === "quota-exceeded"
            ? "Guest chat is paused — the monthly limit is reached."
            : snapshot.gate.reason === "trial-expired"
              ? "Trial ended — guest chat is paused until you subscribe."
              : "Guest chat is paused — subscribe to resume immediately.",
        href: "/billing",
      },
    ];
  }
  // Manual billing: Stripe nags don't apply (see shell banner).
  if (snapshot.manualActive) return [];
  const items: AttentionItem[] = [];
  if (snapshot.status === "PAST_DUE") {
    items.push({
      id: "past-due",
      text: "Latest payment failed — chat keeps running while we retry.",
      href: "/billing",
    });
  }
  if (snapshot.status === "TRIAL" && snapshot.trialDaysLeft <= 7) {
    items.push({
      id: "trial-ending",
      text:
        snapshot.trialDaysLeft <= 1
          ? "Trial ends today — subscribe to keep guest chat running."
          : `Trial ends in ${snapshot.trialDaysLeft} days — subscribe to keep guest chat running.`,
      href: "/billing",
    });
  }
  return items;
}

export type ChecklistInput = {
  hasProperty: boolean;
  bindingTestOk: boolean;
  widgetKeyMinted: boolean;
  hasConversation: boolean;
};

export type ChecklistStep = { id: string; label: string; done: boolean; href: string };

/** First-run Home checklist. Each tick derives from real state only. */
export function checklistSteps(input: ChecklistInput): ChecklistStep[] {
  return [
    { id: "property", label: "Add your property", done: input.hasProperty, href: "/settings" },
    { id: "binding", label: "Connect your booking system", done: input.bindingTestOk, href: "/chatbot/booking" },
    { id: "widget", label: "Install the widget", done: input.widgetKeyMinted, href: "/setup/kit" },
    { id: "chat", label: "Send a test chat", done: input.hasConversation, href: "/assistant" },
  ];
}

export function checklistComplete(input: ChecklistInput): boolean {
  return input.hasProperty && input.bindingTestOk && input.widgetKeyMinted && input.hasConversation;
}

export type OwnerProperty = {
  id: string;
  name: string;
  planBadge: string;
};

// SERVICE PATH (marked): cross-property by definition — answers "which
// resorts does this owner email own?" for the switcher. Ownership proof
// (ownerEmail match or the session's own row) is re-checked on switch.
export async function listOwnerProperties(email: string, primaryPropertyId: string | null): Promise<OwnerProperty[]> {
  const db = prismaService();
  const rows = await db.property
    .findMany({
      where: {
        status: "ACTIVE",
        OR: [{ ownerEmail: email }, ...(primaryPropertyId ? [{ id: primaryPropertyId }] : [])],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
    .catch(() => []);
  const out: OwnerProperty[] = [];
  for (const row of rows) {
    const snap = await getBillingSnapshot(row.id, new Date()).catch(() => null);
    out.push({ id: row.id, name: row.name, planBadge: snap && snap.hasSubscription ? snap.tier : "No plan" });
  }
  return out;
}

/**
 * Which property an OWNER session opens on: lastPropertyId when it still
 * resolves (exists, ACTIVE, owned by this email), else the primary
 * propertyId. Used by login so the switcher choice survives sign-in.
 */
export async function preferredOwnerProperty(user: {
  email: string;
  propertyId: string;
  lastPropertyId: string | null;
}): Promise<string> {
  if (!user.lastPropertyId || user.lastPropertyId === user.propertyId) return user.propertyId;
  const row = await prismaService()
    .property.findUnique({ where: { id: user.lastPropertyId }, select: { id: true, status: true, ownerEmail: true } })
    .catch(() => null);
  if (row && row.status === "ACTIVE" && row.ownerEmail === user.email) return row.id;
  return user.propertyId;
}

export type SwitchTarget = { id: string; status: string; ownerEmail: string | null };

/**
 * Pure switch validation: the target must exist, be ACTIVE, and belong to
 * this owner (ownerEmail match, or the session's own primary row for
 * pre-fix properties). Anything else fails closed (returns null).
 */
export function validateSwitchTarget(
  session: Pick<Session, "role" | "email" | "propertyId"> | null,
  target: SwitchTarget | null
): string | null {
  if (!session || session.role !== "OWNER" || !target) return null;
  if (target.status !== "ACTIVE") return null;
  if (target.ownerEmail && session.email && target.ownerEmail === session.email) return target.id;
  if (session.propertyId && target.id === session.propertyId) return target.id;
  return null;
}

/**
 * Switch an OWNER session to another owned property: re-mint the signed
 * cookie token with the new propertyId (same session row — the row check
 * in getSession still applies) and persist it as lastPropertyId so the
 * choice survives sign-in. Returns the new token, or null on any failure.
 */
export async function switchOwnerProperty(
  session: Session,
  targetId: string
): Promise<{ token: string; propertyId: string } | null> {
  if (session.role !== "OWNER" || !targetId) return null;
  // SERVICE PATH (marked): exact-id read + own-row write for the switch.
  const db = prismaService();
  const target = await db.property
    .findUnique({ where: { id: targetId }, select: { id: true, status: true, ownerEmail: true } })
    .catch(() => null);
  const validated = validateSwitchTarget(session, target);
  if (!validated) return null;
  if (session.uid && session.uid !== "bootstrap") {
    await db.user.update({ where: { id: session.uid }, data: { lastPropertyId: validated } }).catch(() => null);
  }
  const token = createSessionToken({ ...session, propertyId: validated });
  if (!token) return null;
  return { token, propertyId: validated };
}

export type ChatbotData = {
  propertyId: string;
  propertyName: string;
  widgetKey: string | null;
  domains: { id: string; domain: string; propertyId: string; active: boolean; createdAt: string }[];
  tokens: { id: string; prefix: string; name: string; propertyId: string; active: boolean; createdAt: string }[];
  activeTokenCount: number;
  bindings: {
    id: string;
    propertyId: string;
    suiteBaseUrl: string;
    paymentPageUrl: string | null;
    version: number;
    secretSet: boolean;
    lastTestedAt: string | null;
    lastTestOk: boolean | null;
    createdAt: string;
  }[];
  backendFailures: { toolName: string; error: string; propertyId: string; createdAt: string }[];
  profile: { assistantName: string; greeting: string; tone: string; suggestionSegments: string[] } | null;
};

/**
 * Everything the Chatbot section renders, in tenant scope. Same reads the
 * settings page made before D1 moved its sections here — no new queries.
 */
export async function getChatbotData(propertyId: string): Promise<ChatbotData | null> {
  const loaded = await withTenant(propertyId, (tx) =>
    Promise.all([
      tx.property.findUnique({ where: { id: propertyId }, select: { id: true, name: true, widgetKey: true } }),
      tx.approvedDomain.findMany({ where: { propertyId }, orderBy: { createdAt: "asc" } }),
      tx.bridgeToken.findMany({ where: { propertyId }, orderBy: { createdAt: "asc" } }),
      tx.propertyBinding.findMany({ where: { propertyId }, orderBy: { createdAt: "asc" } }),
      tx.propertyProfile.findUnique({ where: { propertyId } }).catch(() => null),
      tx.toolCallLog
        .findMany({
          where: { conversation: { propertyId }, toolName: { in: BACKEND_FAILURE_TOOL_NAMES } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { conversation: { select: { propertyId: true } } },
        })
        .catch(() => []),
    ])
  ).catch(() => null);
  if (!loaded) return null;
  const [property, domains, tokenRows, bindings, profile, recentLogs] = loaded;
  if (!property) return null;
  return {
    propertyId: property.id,
    propertyName: property.name,
    widgetKey: property.widgetKey ?? null,
    domains: domains.map((d) => ({
      id: d.id,
      domain: d.domain,
      propertyId: d.propertyId,
      active: d.active,
      createdAt: d.createdAt.toISOString(),
    })),
    tokens: tokenRows.map((r) => ({
      id: r.id,
      prefix: r.prefix,
      name: r.name,
      propertyId: r.propertyId,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    })),
    activeTokenCount: tokenRows.filter((r) => r.active).length,
    bindings: bindings.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      suiteBaseUrl: r.suiteBaseUrl,
      paymentPageUrl: r.paymentPageUrl,
      version: r.version,
      secretSet: r.secretEnc !== null,
      lastTestedAt: r.lastTestedAt?.toISOString() ?? null,
      lastTestOk: r.lastTestOk,
      createdAt: r.createdAt.toISOString(),
    })),
    backendFailures: recentLogs
      .filter((l) => isFailureOutput(l.output))
      .slice(0, 10)
      .map((l) => ({
        toolName: l.toolName,
        error: (l.output as { error: string }).error,
        propertyId: l.conversation.propertyId,
        createdAt: l.createdAt.toISOString(),
      })),
    profile: profile
      ? {
          assistantName: profile.assistantName ?? "",
          greeting: profile.greeting ?? "",
          tone: profile.tone ?? "",
          suggestionSegments: profile.suggestionSegments ?? [],
        }
      : null,
  };
}

export type HomeData = {
  propertyId: string;
  propertyName: string;
  snapshot: BillingSnapshot;
  attention: AttentionItem[];
  checklist: ChecklistStep[] | null;
  binding: { suiteBaseUrl: string; lastTestOk: boolean | null } | null;
  conversationsWeek: number;
  conversationsMonth: number;
  openHandoffs: number;
  widgetKey: string | null;
  bindingId: string | null;
};

/** Everything Home renders, in tenant scope. Callers pass a verified propertyId. */
export async function getHomeData(propertyId: string): Promise<HomeData | null> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [snapshot, agg] = await Promise.all([
    getBillingSnapshot(propertyId, now).catch(() => null),
    withTenant(propertyId, (tx) =>
      Promise.all([
        tx.property.findUnique({ where: { id: propertyId }, select: { id: true, name: true, widgetKey: true } }),
        tx.propertyBinding.findUnique({ where: { propertyId }, select: { id: true, suiteBaseUrl: true, lastTestOk: true } }),
        tx.conversation.count({ where: { propertyId, createdAt: { gte: weekAgo } } }),
        tx.conversation.count({ where: { propertyId, createdAt: { gte: monthStart } } }),
        tx.handoffRecord.count({ where: { status: "OPEN", conversation: { propertyId } } }),
      ])
    ).catch(() => null),
  ]);
  if (!snapshot || !agg) return null;
  const [property, binding, conversationsWeek, conversationsMonth, openHandoffs] = agg;
  if (!property) return null;
  const checks: ChecklistInput = {
    hasProperty: true,
    bindingTestOk: binding?.lastTestOk === true,
    widgetKeyMinted: !!property.widgetKey,
    hasConversation: conversationsMonth > 0 || (await hasAnyConversation(propertyId)),
  };
  return {
    propertyId,
    propertyName: property.name,
    snapshot,
    attention: attentionItems({ snapshot }),
    checklist: checklistComplete(checks) ? null : checklistSteps(checks),
    binding: binding ? { suiteBaseUrl: binding.suiteBaseUrl, lastTestOk: binding.lastTestOk } : null,
    conversationsWeek,
    conversationsMonth,
    openHandoffs,
    widgetKey: property.widgetKey ?? null,
    bindingId: binding?.id ?? null,
  };
}

async function hasAnyConversation(propertyId: string): Promise<boolean> {
  const found = await withTenant(propertyId, (tx) => tx.conversation.findFirst({ where: { propertyId }, select: { id: true } })).catch(
    () => null
  );
  return !!found;
}
