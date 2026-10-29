// Staff embed page (staff iframe widget, P3). Deliberately OUTSIDE the
// (shell) route group: an iframe must render bare, with no sidebar. The
// client dashboard embeds <iframe src="…/staff/embed?token=<embed-token>">
// after minting the token server-side (POST /api/bridge/embed-tokens).
// Three gates, all server-side, before anything renders:
//   1. The token verifies (signature + 15-minute expiry + property).
//   2. The request's Referer matches the token's bound origin (fail
//      closed — a missing or mismatched Referer shows the error panel).
//   3. The property is ACTIVE (suspend kills dashboards immediately —
//      no 15-minute tail on already-minted tokens).
// Any failure renders an honest error panel, never the widget, and the
// widget's own API calls re-verify token + property on every request.

import { headers } from "next/headers";
import { verifyEmbedToken } from "@/lib/auth";
import { refererMatchesOrigin } from "@/lib/bridge";
import { isPropertyActive } from "@/lib/tenant";
import StaffEmbed from "../../components/StaffEmbed";

export const dynamic = "force-dynamic";

export default async function StaffEmbedPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const embed = verifyEmbedToken(params.token);
  const h = await headers();
  const referer = h.get("referer");
  const bound = embed ? refererMatchesOrigin(referer, embed.origin) : false;
  const live = embed ? await isPropertyActive(embed.propertyId) : false;

  if (!embed || !bound || !live) {
    const reason = !embed
      ? "This staff widget link is missing, invalid, or expired (links last 15 minutes)."
      : !bound
        ? "This staff widget is bound to a different dashboard. Dashboards must send a Referer — a no-referrer policy cannot host the widget."
        : "This staff widget is unavailable right now.";
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-white p-6 font-sans text-gray-900 antialiased">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0C1222]">
            <img src="/brand/vivereply-mark.svg" alt="" className="h-8 w-8" />
          </span>
          <span className="text-[15px] font-semibold">Vivereply Concierge</span>
        </div>
        <h1 className="mt-4 text-lg font-bold">Staff widget unavailable</h1>
        <p className="mt-1 text-sm text-gray-500">{reason}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-white font-sans text-gray-900 antialiased">
      <StaffEmbed token={params.token as string} propertyId={embed.propertyId} />
    </main>
  );
}
