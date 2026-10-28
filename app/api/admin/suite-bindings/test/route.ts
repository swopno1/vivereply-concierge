// Suite-binding connection test (adapter Phase 2, admin session only).
//   POST /api/admin/suite-bindings/test { id }
//     -> { ok, ping, latencyMs, detail }
// Runs fully server-side (the secret never leaves the server) and records
// the result on the row. Two tiers, because the ping relay to Cosmo is
// deferred: a backend answering /api/concierge/ping is fully v1; a backend
// answering the lookup probe with a JSON 404 is reachable but pre-ping.
// Either way nothing is written to the backend — both probes are reads.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { decryptSecret } from "@/lib/secrets";
import { HttpSuiteAdapter, SUITE_API_VERSION } from "@/lib/suite";

export async function POST(req: NextRequest) {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Binding id is required." }, { status: 400 });
  }
  const row = await prisma.propertyBinding.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "Binding not found." }, { status: 404 });
  }
  let secret: string | null = null;
  if (row.secretEnc) {
    try {
      secret = decryptSecret(row.secretEnc);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Stored secret cannot be read." },
        { status: 500 }
      );
    }
  }
  const adapter = new HttpSuiteAdapter({
    baseUrl: row.suiteBaseUrl.replace(/\/$/, ""),
    secret,
    version: SUITE_API_VERSION,
  });
  const started = Date.now();
  try {
    const ping = await adapter.ping();
    await prisma.propertyBinding.update({
      where: { id },
      data: { lastTestedAt: new Date(), lastTestOk: true },
    });
    return NextResponse.json({
      ok: true,
      ping: true,
      latencyMs: Date.now() - started,
      detail: `Ping OK (backend reports suite v${ping.suiteVersion}).`,
    });
  } catch {
    // No ping (yet): prove HTTP + JSON reachability with a lookup for a
    // code that cannot exist. A spec backend answers 404 + JSON — reads
    // only, nothing written, nothing found.
    try {
      await adapter.lookupBookingByCode("CONCIERGE-PROBE-000000");
      await prisma.propertyBinding.update({
        where: { id },
        data: { lastTestedAt: new Date(), lastTestOk: true },
      });
      return NextResponse.json({
        ok: true,
        ping: false,
        latencyMs: Date.now() - started,
        detail: "Reachable, but the ping endpoint is missing (pre-v1 backend).",
      });
    } catch (probeError) {
      const message = probeError instanceof Error ? probeError.message : "";
      const reachable = message === "not_found" || message === "not found";
      await prisma.propertyBinding.update({
        where: { id },
        data: { lastTestedAt: new Date(), lastTestOk: reachable },
      });
      if (reachable) {
        return NextResponse.json({
          ok: true,
          ping: false,
          latencyMs: Date.now() - started,
          detail: "Reachable, but the ping endpoint is missing (pre-v1 backend).",
        });
      }
      return NextResponse.json({
        ok: false,
        ping: false,
        latencyMs: Date.now() - started,
        detail: message || "Backend did not answer.",
      });
    }
  }
}
