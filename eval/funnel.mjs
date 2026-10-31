// Booking funnel from the events we already log, per property:
// widget opens -> conversations -> quoted -> drafted -> resort-pay
// pointer -> handoff. Success = a tool output WITHOUT an error field.
// Opens come from the widget.js sendBeacon (WidgetOpen rows, property
// + timestamp only); only panel taps count, never page loads. There is
// deliberately no "paid" stage: resort-site payments are invisible here.
//
//   pnpm funnel                 # last 30 days
//   pnpm funnel -- --days=7
//
// Needs DATABASE_URL (or DIRECT_URL). Run from a machine that reaches
// the database (NOT this sandbox: raw TCP to Supabase is blocked here).

import { fileURLToPath } from "node:url";

const daysArg = process.argv.slice(2).find((a) => a.startsWith("--days="));
const DAYS = Math.max(1, Number.parseInt(daysArg?.split("=")[1] ?? "30", 10) || 30);

async function main() {
  try {
    const dotenv = await import("dotenv").catch(() => null);
    dotenv?.config?.({ path: ".env.local" });
    dotenv?.config?.();
  } catch { /* env-only is fine */ }

  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("Refusing: set DATABASE_URL (or DIRECT_URL) in the environment.");
    process.exit(1);
  }
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

  try {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
    console.log(`funnel: last ${DAYS} day(s).`);

    const [opens, convs, logs, handoffs] = await Promise.all([
      prisma.widgetOpen.findMany({
        where: { createdAt: { gte: since } },
        select: { propertyId: true },
      }),
      prisma.conversation.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, propertyId: true },
      }),
      prisma.toolCallLog.findMany({
        where: {
          createdAt: { gte: since },
          toolName: { in: ["get_quote", "create_booking_draft", "get_resort_payment_link"] },
        },
        select: { toolName: true, output: true, conversationId: true },
      }),
      prisma.handoffRecord.findMany({
        where: { createdAt: { gte: since } },
        select: { conversationId: true },
      }),
    ]);

    const propOf = new Map(convs.map((c) => [c.id, c.propertyId]));
    const ok = (l) => {
      const out = l.output;
      return out !== null && typeof out === "object" && typeof out.error !== "string";
    };
    const quoted = new Set(logs.filter((l) => l.toolName === "get_quote" && ok(l)).map((l) => l.conversationId));
    const drafted = new Set(
      logs.filter((l) => l.toolName === "create_booking_draft" && ok(l)).map((l) => l.conversationId)
    );
    const linked = new Set(
      logs.filter((l) => l.toolName === "get_resort_payment_link" && ok(l)).map((l) => l.conversationId)
    );
    const handed = new Set(handoffs.map((h) => h.conversationId));

    const props = [...new Set(convs.map((c) => c.propertyId))].sort();
    const row = (label, set) => {
      const cells = props.map((p) => [...set].filter((cid) => propOf.get(cid) === p).length);
      console.log(`  ${label.padEnd(14)} ${cells.map((n, i) => `${props[i]}:${n}`).join("  ")}  total:${set.size}`);
    };
    console.log("conversations are distinct ids; later stages also imply earlier ones only per conversation.");
    const openCells = props.map((p) => opens.filter((o) => o.propertyId === p).length);
    console.log(`  ${"opens".padEnd(14)} ${openCells.map((n, i) => `${props[i]}:${n}`).join("  ")}  total:${opens.length}`);
    row("chats", new Set(convs.map((c) => c.id)));
    row("quoted", quoted);
    row("drafted", drafted);
    row("pay-linked", linked);
    row("handoffs", handed);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`funnel: FAILED: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
