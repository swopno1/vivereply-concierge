// Settings (inside the shell route group). Admin-protected: no valid
// session cookie means a redirect to /login. A mix of real rooms and
// honest placeholders — a section marked Later renders no working
// controls, only what it will hold. Snippet origins come from the live
// request headers, so preview deployments show their own URLs, not
// production's.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { WIDGET_KEYS } from "@/demo-config/widget-keys";
import CopyButton from "../../components/CopyButton";
import SignOutButton from "../../components/SignOutButton";
import SuiteBindings from "../../components/SuiteBindings";
import RoomCatalogues from "../../components/RoomCatalogues";

export const dynamic = "force-dynamic";

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="border-b border-gray-200 pb-2">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{blurb}</p>
      </header>
      {children}
    </section>
  );
}

function Later({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 opacity-80">
      <p className="text-sm font-medium text-gray-700">
        <span className="mr-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
          Later
        </span>
        {what}
      </p>
    </div>
  );
}

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <CopyButton text={text} label={label} />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 px-3 py-2 font-mono text-xs leading-relaxed text-gray-100">
        {text}
      </pre>
    </div>
  );
}

export default async function SettingsPage() {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login?next=/settings");
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.vivereply.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const domains = await prisma.approvedDomain.findMany({ orderBy: { createdAt: "asc" } });
  const activeDomains = domains.filter((d) => d.active);
  const tokenCount = await prisma.bridgeToken.count({ where: { active: true } });
  const recentLogs = await prisma.toolCallLog.findMany({
    where: {
      toolName: {
        in: [
          "check_availability",
          "get_quote",
          "create_booking_draft",
          "lookup_booking_by_code",
          "request_booking_details",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { conversation: { select: { propertyId: true } } },
  });
  const backendFailures = recentLogs
    .filter((l) => {
      const out = l.output as { error?: unknown } | null;
      return out !== null && typeof out === "object" && typeof out.error === "string";
    })
    .slice(0, 10)
    .map((l) => ({
      toolName: l.toolName,
      error: (l.output as { error: string }).error,
      propertyId: l.conversation.propertyId,
      createdAt: l.createdAt.toISOString(),
    }));
  const bindingRows = await prisma.propertyBinding.findMany({ orderBy: { createdAt: "asc" } });
  const initialBindings = bindingRows.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    suiteBaseUrl: r.suiteBaseUrl,
    version: r.version,
    secretSet: r.secretEnc !== null,
    lastTestedAt: r.lastTestedAt?.toISOString() ?? null,
    lastTestOk: r.lastTestOk,
    createdAt: r.createdAt.toISOString(),
  }));

  const keys = Object.entries(WIDGET_KEYS);
  const bridgeExample = [
    `# Staff bridge — run from the client SERVER, never the browser.`,
    `# Mint the key in /admin; it is shown once.`,
    `BRIDGE_KEY='cb.<prefix>.<secret>'`,
    `curl -s "${origin}/api/bridge/handoffs?status=OPEN" \\`,
    `  -H "Authorization: Bearer $BRIDGE_KEY"`,
  ].join("\n");
  const bridgeNode = [
    `// Node (server only). Full contract: docs/bridge-integration.md`,
    `const res = await fetch("${origin}/api/bridge/handoffs?status=OPEN", {`,
    `  headers: { Authorization: \`Bearer \${process.env.CONCIERGE_BRIDGE_KEY}\` },`,
    `});`,
    `const openHandoffs = await res.json();`,
  ].join("\n");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">
          Configuration rooms for the Concierge. Real rooms work; rooms marked Later are
          reserved space for upcoming features.
        </p>
      </header>

      <Section
        title="Chat widget codes"
        blurb="One script tag per key. It only runs on that property's approved domains."
      >
        {keys.map(([key, prop]) => {
          const snippet = `<script src="${origin}/widget.js" data-key="${key}"></script>`;
          const approved = domains.filter((d) => d.propertyId === prop.propertyId && d.active);
          return (
            <div key={key} className="flex flex-col gap-2">
              <Snippet label={`${prop.title} (${key})`} text={snippet} />
              <p className="text-sm text-gray-500">
                Approved domains:{" "}
                {approved.length > 0 ? approved.map((d) => d.domain).join(", ") : "none yet — add one in "}
                <a href="/admin" className="underline">
                  Admin
                </a>
                .
              </p>
            </div>
          );
        })}
      </Section>

      <Section
        title="Staff bridge codes"
        blurb="Server-to-server snippets for client dashboards. Keys are minted in Admin and stay on the client server."
      >
        <Snippet label="List open handoffs (curl)" text={bridgeExample} />
        <Snippet label="List open handoffs (Node)" text={bridgeNode} />
        <p className="text-sm text-gray-500">
          Full contract (read, assign, close, notes):{" "}
          <span className="font-mono">docs/bridge-integration.md</span> in the repo.{" "}
          {tokenCount} active bridge {tokenCount === 1 ? "key" : "keys"} —{" "}
          <a href="/admin" className="underline">
            manage in Admin
          </a>
          .
        </p>
      </Section>

      <Section
        title="Suite connections"
        blurb="One booking backend per property. Test runs server-side and never reveals the key. URL and key changes apply on the next chat message."
      >
        <SuiteBindings initial={initialBindings} />
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Recent backend failures</p>
          {backendFailures.length === 0 ? (
            <p className="text-sm text-gray-500">None in the last 50 backend calls.</p>
          ) : (
            backendFailures.map((f, i) => (
              <p key={i} className="text-sm text-gray-700">
                <span className="font-mono">{f.toolName}</span> · {f.propertyId} · {f.error}
              </p>
            ))
          )}
        </div>
      </Section>

      <Section
        title="Room catalogues"
        blurb="One room list per property. Rows govern chat once present; seed the demo file to start."
      >
        <RoomCatalogues />
      </Section>

      <Section
        title="Secrets"
        blurb="Reserved room for secret configuration. Nothing to configure here yet."
      >
        <Later what="Secret rooms will live here (bridge keys, webhook signers) once more integrations need them. Bridge keys are managed in Admin today." />
      </Section>

      <Section title="Security" blurb="What protects this app right now — live status, not promises.">
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
          {[
            ["Admin login (password + signed session cookie)", true],
            [`Approved widget domains (${activeDomains.length} active)`, activeDomains.length > 0],
            ["Widget token handshake (per-message domain re-check)", true],
            [`Bridge keys (hashed, revocable, ${tokenCount} active)`, true],
            ["Rate limiting", false],
            ["Two-factor authentication", false],
          ].map(([label, on]) => (
            <p key={String(label)} className="flex items-center justify-between gap-3 text-gray-900">
              <span>{label as string}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  on ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                }`}
              >
                {on ? "On" : "Off"}
              </span>
            </p>
          ))}
        </div>
        <p className="text-sm text-gray-500">
          Domains and bridge keys are managed in{" "}
          <a href="/admin" className="underline">
            Admin
          </a>
          .
        </p>
      </Section>

      <Section title="Profile" blurb="The v1 admin account: single admin, no user table yet.">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-gray-900">Signed in as Admin</p>
            <p className="text-sm text-gray-500">
              The admin password lives in the deployment environment, not in the app.
            </p>
          </div>
          <SignOutButton />
        </div>
      </Section>

      <Section
        title="Appearance"
        blurb="Reserved room for widget look-and-feel. Nothing to configure here yet."
      >
        <Later what="Widget theme controls (position, colors, greeting) will live here once the widget supports them." />
      </Section>
    </div>
  );
}
