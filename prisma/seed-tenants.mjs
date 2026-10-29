// Tenant seed (multi-tenant core). THE manual-registration file: the founder
// registers a property by editing TENANTS below (including ownerPassword)
// and running:
//
//   pnpm seed:tenants
//
// What it does (all idempotent upserts, safe to re-run):
//   Property row + ApprovedDomain rows + RoomMapping rows + OWNER User row
//   per entry. Krishnachura carries NO rooms here — its demo file stays the
//   fallback until the catalogue is seeded from Settings (row-by-row UUID
//   verification stays a deliberate act, not a blind copy).
//
// SECURITY CONTRACT — read before editing:
// - Owner passwords are INLINE below, hence COMMITTED to git. Treat them
//   as public to every repo reader. Test tenants ONLY (see
//   docs/seed-users.md) — real tenants MUST use /admin/register, whose
//   temp passwords are shown once and never stored.
// - A password applies on user CREATE only, with mustChangePassword set
//   (human first login is forced to rotate; automation is unaffected).
//   Re-running NEVER resets an existing user's password — rotation
//   happens in Settings. This is deliberate: re-running must not
//   silently restore a public password over a rotated one.
// - A tenant with an empty ownerEmail seeds its property + domains but
//   NO user (safe default — fill email + password, re-run, appears).
// - Minimum password length: 12. Exit non-zero on the first refusal,
//   having changed nothing for that tenant (earlier tenants keep
//   their rows — re-run after fixing).
//
// Run from a machine that reaches the database (NOT this sandbox: raw TCP
// to Supabase is blocked here). Needs DATABASE_URL (or DIRECT_URL).

import { scrypt as scryptCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const scryptAsync = promisify(scryptCb);

// --- scrypt twin of lib/auth.ts (N=16384, r=8, p=1, 32 bytes) -------------
// Exported (with main() import-guarded below) so the parity probe can prove
// the seed's hashes verify in the app's verifier — same params, same format.
export function hashPassword(password) {
  const salt = randomBytes(16);
  return scryptAsync(password, salt, 32, { N: 16384, r: 8, p: 1 }).then(
    (hash) => `scrypt$1$${salt.toString("hex")}$${hash.toString("hex")}`
  );
}

// ================= EDIT BELOW THIS LINE =================
// ownerPassword values are COMMITTED (see contract above): test logins
// only, obviously demo-scoped, rotated in Settings after first use.
const TENANTS = [
  {
    id: "krishnachura-retreat",
    name: "Krishnachura Retreat",
    widgetKey: "demo-krishnachura",
    domains: ["demo1.vivereply.com"],
    ownerEmail: "krishnachura@test.com",
    ownerPassword: "krishnachura-demo-login-01",
  },
  {
    id: "seabreeze-test",
    name: "Seabreeze Test Inn",
    widgetKey: "test-seabreeze",
    domains: [], // direct-token chat only until a domain is approved
    ownerEmail: "sabreeze@test.com",
    ownerPassword: "seabreeze-demo-login-01",
    // PRICE CONTRACT: these MUST equal demo-config/fixture.ts (same slugs,
    // same poisha, same suiteRoomIds). A mismatch surfaces as a totals
    // warning on drafts — visible, never silent.
    rooms: [
      { slug: "harbor-suite", name: "Harbor Suite", basePricePoisha: 1250000, suiteRoomId: "fx-harbor-suite", highlights: ["Harbor-view balcony", "King bed"] },
      { slug: "dune-room", name: "Dune Room", basePricePoisha: 680000, suiteRoomId: "fx-dune-room", highlights: ["Dune garden access", "Rain shower"] },
    ],
  },
];
// ================= EDIT ABOVE THIS LINE =================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    for (const t of TENANTS) {
      if (!t.id || t.id.length > 100) throw new Error(`Bad tenant id: ${JSON.stringify(t.id)}`);
      const property = await prisma.property.upsert({
        where: { id: t.id },
        create: { id: t.id, name: t.name, widgetKey: t.widgetKey, status: "ACTIVE" },
        update: { name: t.name, widgetKey: t.widgetKey },
      });
      console.log(`property: ${property.id} (${property.name})`);
      for (const domain of t.domains ?? []) {
        await prisma.approvedDomain.upsert({
          where: { domain_propertyId: { domain, propertyId: t.id } },
          create: { domain, propertyId: t.id, active: true },
          update: { active: true },
        });
        console.log(`  domain: ${domain} approved`);
      }
      for (const room of t.rooms ?? []) {
        await prisma.roomMapping.upsert({
          where: { propertyId_slug: { propertyId: t.id, slug: room.slug } },
          create: { propertyId: t.id, slug: room.slug, name: room.name, basePricePoisha: room.basePricePoisha, suiteRoomId: room.suiteRoomId, highlights: room.highlights },
          update: { name: room.name, basePricePoisha: room.basePricePoisha, suiteRoomId: room.suiteRoomId, highlights: room.highlights },
        });
        console.log(`  room: ${room.slug} (${room.name})`);
      }
      if (!t.ownerEmail) {
        console.log("  owner: (none — fill ownerEmail and re-run to create the login)");
        continue;
      }
      if (!EMAIL_RE.test(t.ownerEmail)) throw new Error(`Bad owner email for ${t.id}: ${t.ownerEmail}`);
      const password = t.ownerPassword ?? "";
      if (!password) throw new Error(`Refusing: ${t.id} has no ownerPassword (see docs/seed-users.md).`);
      if (password.length < 12) throw new Error(`Refusing: ${t.id} ownerPassword must be at least 12 characters.`);
      const email = t.ownerEmail.toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.propertyId && existing.propertyId !== t.id) {
        throw new Error(`Refusing: ${email} already owns ${existing.propertyId}.`);
      }
      if (existing) {
        // Existing logins keep their (possibly rotated) password: re-running
        // must never restore the committed value over it. Rotate in Settings.
        console.log(`  owner: ${email} (exists — password untouched; rotate in Settings)`);
        continue;
      }
      const passwordHash = await hashPassword(password);
      await prisma.user.create({
        // Team-seeded: email attested, verified at creation (see schema).
        data: { email, passwordHash, role: "OWNER", propertyId: t.id, active: true, mustChangePassword: true, emailVerifiedAt: new Date() },
      });
      console.log(`  owner: ${email} (created — must change password at first login)`);
    }
    console.log("seed-tenants: done.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`seed-tenants: FAILED: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
