// Public widget keys (step 4). A key is NOT a secret and NOT an
// authentication token — it is a public identifier a site puts in its
// embed script so the widget panel knows which property to label the
// conversation with. An unknown key shows an error panel instead of a
// chat, never a guessed property.
//
// Multi-tenant core: seeded properties carry their own widgetKey in the
// Property table, resolved by resolveWidgetProperty (static map first,
// database second). Static entries apply ONLY to the configured demo
// property: with DEMO_PROPERTY_ID unset (production) no static key
// resolves and every key falls through to the database. An unknown or
// inactive key shows an error panel instead of a chat, never a guessed
// property.
import { demoPropertyId } from "@/lib/demo";

export type WidgetProperty = {
  propertyId: string;
  title: string;
};

export const WIDGET_KEYS: Record<string, WidgetProperty> = {
  "demo-krishnachura": {
    propertyId: "krishnachura-retreat",
    title: "Krishnachura Retreat",
  },
};

export function getWidgetProperty(key: string | null): WidgetProperty | undefined {
  if (!key) return undefined;
  const entry = WIDGET_KEYS[key];
  if (!entry) return undefined;
  const demo = demoPropertyId();
  if (demo === null || entry.propertyId !== demo) return undefined;
  return entry;
}

// Gated view of the static map for display surfaces (Settings embed
// snippets): same rule as resolution — only the configured demo
// property's entries. Never render WIDGET_KEYS directly.
export function visibleWidgetKeys(): Array<[string, WidgetProperty]> {
  const demo = demoPropertyId();
  if (demo === null) return [];
  return Object.entries(WIDGET_KEYS).filter(([, prop]) => prop.propertyId === demo);
}

export async function resolveWidgetProperty(key: string | null): Promise<WidgetProperty | undefined> {
  const statik = getWidgetProperty(key);
  if (statik) return statik;
  if (!key) return undefined;
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.property.findUnique({ where: { widgetKey: key } }).catch(() => null);
  if (!row || row.status !== "ACTIVE") return undefined;
  return { propertyId: row.id, title: row.name };
}
