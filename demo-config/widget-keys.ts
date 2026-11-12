// Public widget keys (step 4). A key is NOT a secret and NOT an
// authentication token — it is a public identifier a site puts in its
// embed script so the widget panel knows which property to label the
// conversation with. Every property carries its own widgetKey in the
// Property table (minted at signup); resolution is database-only. An
// unknown or inactive key shows an error panel instead of a chat, never
// a guessed property.

export type WidgetProperty = {
  propertyId: string;
  title: string;
};

export async function resolveWidgetProperty(key: string | null): Promise<WidgetProperty | undefined> {
  if (!key) return undefined;
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.property.findUnique({ where: { widgetKey: key } }).catch(() => null);
  if (!row || row.status !== "ACTIVE") return undefined;
  return { propertyId: row.id, title: row.name };
}
