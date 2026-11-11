// Email verification landing (public — the token IS the auth: 256-bit,
// hashed at rest, 24h expiry, single use). Clicking a valid link marks
// the owner's email verified and unlocks configuration. No session is
// required (or created): logged-out clickers verify, then log in.

import Link from "next/link";
import { createHash } from "node:crypto";
// SERVICE PATH (marked): token-keyed bootstrap — the tenant is unknown
// until the token resolves, so this cannot go through withTenant. The
// unguessable token hash is the authorization, not RLS.
import { prismaService } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const raw = typeof params.token === "string" ? params.token : "";
  let ok = false;
  if (raw) {
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const row = await prismaService().emailVerificationToken
      .findUnique({ where: { tokenHash }, include: { user: true } })
      .catch(() => null);
    const live = row && !row.usedAt && row.expiresAt > new Date() && row.user.active;
    if (live && row) {
      await prismaService().$transaction([
        prismaService().emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
        prismaService().user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
      ]).catch(() => null);
      const check = await prismaService().user
        .findUnique({ where: { id: row.userId }, select: { emailVerifiedAt: true } })
        .catch(() => null);
      ok = check?.emailVerifiedAt != null;
    }
  }

  // Mark header, Back-to-homepage, Docs, and footer live in the
  // (auth) layout — this page owns the verdict plus its links.
  return (
    <div className="flex flex-col">
      {ok ? (
        <>
          <h1 className="text-2xl font-semibold text-gray-900">Email verified</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your resort&apos;s configuration is unlocked. The guided setup
            walks through rooms, backend, and widget next.
          </p>
          <Link
            href="/setup"
            className="mt-6 rounded-full bg-black px-5 py-2 text-center text-sm font-medium text-white"
          >
            Continue setup
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-gray-900">Link invalid or expired</h1>
          <p className="mt-2 text-sm text-gray-600">
            Verification links work once and expire after 24 hours. Log in
            and request a fresh link from Settings.
          </p>
          <Link
            href="/login?next=/settings"
            className="mt-6 rounded-full bg-black px-5 py-2 text-center text-sm font-medium text-white"
          >
            Log in
          </Link>
        </>
      )}
    </div>
  );
}
