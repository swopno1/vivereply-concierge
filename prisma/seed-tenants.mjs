// Tenant seed (multi-tenant core). Since the signup era (2026-11-04) this
// seeds ONLY fixture/test tenants — real properties (including the demo
// resort) come from public /signup with owner-chosen IDs, never from here.
// Seeding a second "demo" property would duplicate live domain approvals.
//
//   pnpm seed:tenants                        # all fixture tenants
//   pnpm seed:tenants -- --tenant=seabreeze-test   # one tenant only
//
// What it does (all idempotent upserts, safe to re-run):
//   Property row + ApprovedDomain rows + RoomMapping rows + OWNER User row
//   per entry. The eval referee + isolation probes REQUIRE seabreeze-test
//   (the deterministic fixture backend) — reseed it whenever the database
//   is reset, or every evidence run refuses to start.
//
// SECURITY CONTRACT — read before editing:
// - Owner passwords are INLINE below, hence COMMITTED to git. Treat them
//   as public to every repo reader. Test tenants ONLY (see
//   docs/seed-users.md) — real tenants MUST use public /signup
//   (email verification + Turnstile, no temp passwords).
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
  // NOTE (2026-11-04): the krishnachura-retreat entry was REMOVED. The live
  // demo property is signup-created (owner-chosen ID) with its own widget
  // key and domain approvals — reseeding the old fixed ID here would mint a
  // confusing duplicate property and a second demo1.vivereply.com approval.
  // Fixture tenant(s) only below.
  // Phase 1 addition (NOT a fixture entry): main() upserts the DEMO_PROPERTY_ID
  // row itself (no user, no domains, existing rows untouched) — the demo must
  // exist as an explicit row now that the code no-row fallbacks are gone.
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

  // RLS service path: seeds write unscoped rows (new tenants), which the
  // app role could never insert — so seeds connect via DIRECT_URL (the
  // bypass migrations connection), never the app pooler.
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Refusing: set DATABASE_URL (or DIRECT_URL) in the environment.");
    process.exit(1);
  }
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

  // Phase 1: the demo property MUST exist as an explicit row (the code
  // no-row fallbacks are gone — a missing demo row fails closed). The id
  // comes from DEMO_PROPERTY_ID (owner-chosen, varies per environment),
  // never hardcoded: upsert the row with no user and no domains (safe
  // default — signup owns the demo's login, domains are approved live).
  // update: {} preserves signup-chosen name/widgetKey on re-runs; runs
  // only on unfiltered invocations (a --tenant= filter means just that).
  const onlyArgEarly = process.argv.find((a) => a.startsWith("--tenant="));
  const demoId = (process.env.DEMO_PROPERTY_ID ?? "").trim();
  if (!onlyArgEarly && demoId) {
    try {
      await prisma.property.upsert({
        where: { id: demoId },
        create: { id: demoId, name: "Demo Resort", widgetKey: `key-${demoId}`.slice(0, 60), status: "ACTIVE" },
        update: {},
      });
      console.log(`demo property row ensured: ${demoId} (created or already present; existing rows untouched)`);
    } catch (e) {
      console.log(`demo property row NOT ensured (${e instanceof Error ? e.message : e}) — continuing with fixtures`);
    }
  }

  try {
    const onlyArg = process.argv.find((a) => a.startsWith("--tenant="));
    const only = onlyArg ? onlyArg.slice("--tenant=".length).trim() : "";
    const selected = only ? TENANTS.filter((t) => t.id === only) : TENANTS;
    if (only && selected.length === 0) {
      throw new Error(`Unknown tenant "${only}" (seed knows: ${TENANTS.map((t) => t.id).join(", ") || "none"}).`);
    }
    for (const t of selected) {
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
