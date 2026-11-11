// Seed the first approved widget domain (step 4.5). Idempotent:
// upsert, so re-running it only refreshes the row. Run once after
// `prisma db push`, or skip it and add the domain in /admin instead.
//   pnpm exec tsx prisma/seed-domains.ts
// Historical ids below (krishnachura-retreat): verify them before any
// re-run — under the Phase 1 FKs a ghost propertyId fails loudly
// instead of silently approving a domain for nothing.
import "../lib/env";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// RLS service path: seeds write unscoped rows, which the app role could
// never insert — so this script connects via DIRECT_URL (the bypass
// migrations connection), never the app pooler.
const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DIRECT_URL })),
});

async function main() {
  const row = await prisma.approvedDomain.upsert({
    where: { domain_propertyId: { domain: "demo1.vivereply.com", propertyId: "krishnachura-retreat" } },
    update: { active: true },
    create: { domain: "demo1.vivereply.com", propertyId: "krishnachura-retreat", active: true },
  });
  console.log(`Approved domain: ${row.domain} (property ${row.propertyId}, active ${row.active})`);
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Domain seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
