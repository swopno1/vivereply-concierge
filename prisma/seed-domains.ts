// Seed the first approved widget domain (step 4.5). Idempotent:
// upsert, so re-running it only refreshes the row. Run once after
// `prisma db push`, or skip it and add the domain in /admin instead.
//   pnpm exec tsx prisma/seed-domains.ts
import "../lib/env";
import { prisma } from "../lib/prisma";

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
