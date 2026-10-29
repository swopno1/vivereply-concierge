// Settings (inside the shell route group). Session-protected: no valid
// session cookie means a redirect to /login. Single-property view —
// owners see only their own property, the super-admin may pass
// ?property=<id>. A mix of real rooms and honest placeholders: a section
// marked Later renders no working controls, only what it will hold.
// Snippet origins come from the live request headers, so preview
// deployments show their own URLs, not production's.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, resolvePropertyId, sessionOwnerVerified } from "@/lib/tenant";
import { WIDGET_KEYS } from "@/demo-config/widget-keys";
import CopyButton from "../../components/CopyButton";
import SignOutButton from "../../components/SignOutButton";
import SuiteBindings from "../../components/SuiteBindings";
import RoomCatalogues from "../../components/RoomCatalogues";
import AdminDomains from "../../components/AdminDomains";
import BridgeTokens from "../../components/BridgeTokens";
import PasswordChange from "../../components/PasswordChange";
import EvalRunner from "../../components/EvalRunner";
import VerifyPrompt from "../../components/VerifyPrompt";
import Payments from "../../components/Payments";
import OnboardingApprovals from "../../components/OnboardingApprovals";
import OwnerActions from "../../components/OwnerActions";
import PropertyStatusToggle from "../../components/PropertyStatusToggle";
import AuditTrail from "../../components/AuditTrail";
import { paymentsEnabledGlobal } from "@/lib/payments";
import { CASES } from "@/eval/cases.mjs";

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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/settings");
  }
  // Config lock: unverified owners prove their email before touching
  // any setting. (Super-admins bypass via the helper.)
  if (!(await sessionOwnerVerified(session))) {
    return <VerifyPrompt email={session.email} />;
  }
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const me =
    session.uid === "bootstrap"
      ? null
      : await prisma.user
          .findUnique({ where: { id: session.uid }, select: { mustChangePassword: true } })
          .catch(() => null);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.vivereply.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const property = await prisma.property.findUnique({ where: { id: propertyId } }).catch(() => null);
  const domains = await prisma.approvedDomain.findMany({
    where: { propertyId },
    orderBy: { createdAt: "asc" },
  });
  const activeDomains = domains.filter((d) => d.active);
  const tokenCount = await prisma.bridgeToken.count({ where: { propertyId, active: true } });
  const tokenRows = await prisma.bridgeToken.findMany({
    where: { propertyId },
    orderBy: { createdAt: "asc" },
  });
  const initialTokens = tokenRows.map((r) => ({
    id: r.id,
    prefix: r.prefix,
    name: r.name,
    propertyId: r.propertyId,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  }));
  const initialDomains = domains.map((d) => ({
    id: d.id,
    domain: d.domain,
    propertyId: d.propertyId,
    active: d.active,
    createdAt: d.createdAt.toISOString(),
  }));
  const recentLogs = await prisma.toolCallLog.findMany({
    where: {
      conversation: { propertyId },
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
  const bindingRows = await prisma.propertyBinding.findMany({
    where: { propertyId },
    orderBy: { createdAt: "asc" },
  });
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
  // Booking payments (flag-gated): recent links, tokens never leave the server.
  const paymentsOn = paymentsEnabledGlobal();
  // Stripe mode indicator (server-computed; the key itself never leaves
  // the server). Test vs live comes from the key prefix; an unrecognized
  // prefix is shown as-is rather than guessed.
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeMode = !stripeKey
    ? ("unset" as const)
    : stripeKey.startsWith("sk_test_")
      ? ("test" as const)
      : stripeKey.startsWith("sk_live_")
        ? ("live" as const)
        : ("unrecognized" as const);
  const stripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const paymentRows = paymentsOn
    ? await prisma.paymentLink
        .findMany({ where: { propertyId }, orderBy: { createdAt: "desc" }, take: 50 })
        .catch(() => [])
    : [];
  const initialPayments = paymentRows.map((r) => ({
    id: r.id,
    bookingCode: r.bookingCode,
    method: r.method,
    status: r.status,
    amountPoisha: r.amountPoisha,
    guestFirstName: r.guestFirstName,
    room: r.room,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    manualReference: r.manualReference,
    paidAt: r.paidAt?.toISOString() ?? null,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
  // Super-admin oversight (relocated from the deleted /admin page):
  // cross-property tenants + onboarding approvals. Owners never fetch
  // these rows — the queries below run for super-admins only.
  const isSuper = session.role === "SUPER_ADMIN";
  const allProperties = isSuper
    ? await prisma.property
        .findMany({
          orderBy: { id: "asc" },
          include: { users: { select: { id: true, email: true, role: true, active: true } } },
        })
        .catch(() => [])
    : [];
  const initialRuns = isSuper
    ? await prisma.onboardingRun
        .findMany({ orderBy: { updatedAt: "desc" } })
        .catch(() => [])
        .then((rows) =>
          rows.map((r) => ({
            propertyId: r.propertyId,
            status: r.status,
            approvedRerun: r.approvedRerun,
            approvedBy: r.approvedBy,
            updatedAt: r.updatedAt.toISOString(),
          }))
        )
    : [];

  // Widget keys for THIS property: static entries plus the seeded row's
  // key (deduped — the demo key lives in both until the seed runs).
  const keys = Object.entries(WIDGET_KEYS).filter(([, prop]) => prop.propertyId === propertyId);
  if (property && !keys.some(([key]) => key === property.widgetKey)) {
    keys.push([property.widgetKey, { propertyId: property.id, title: property.name }]);
  }
  const bridgeExample = [
    `# Staff bridge — run from the client SERVER, never the browser.`,
    `# Mint the key in Bridge keys below; it is shown once.`,
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
  const staffWidgetSnippet = [
    `<!-- Staff widget: mint a token server-side per page load, then embed. -->`,
    `<!-- Never put the bridge key in the browser. -->`,
    `<iframe`,
    `  src="${origin}/staff/embed?token=<dashboard-token>"`,
    `  width="100%" height="720" style="border:0; border-radius:12px"`,
    `  title="Concierge staff handoffs"></iframe>`,
  ].join("\n");
  const embedMintSnippet = [
    `# Mint the <dashboard-token> above from the client SERVER (tokens live 15 minutes):`,
    `curl -s -X POST "${origin}/api/bridge/embed-tokens" \\`,
    `  -H "Authorization: Bearer $BRIDGE_KEY" \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"origin":"https://dashboard.example.com"}'`,
  ].join("\n");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">
          Configuration rooms for {property?.name ?? propertyId}. Real rooms work; rooms marked
          Later are reserved space for upcoming features.
        </p>
      </header>

      {isSuper && (
        <Section
          title="Tenants"
          blurb="Registered resorts (public signup + seed file). Owners see exactly their property; suspending a property stops its chat immediately."
        >
          {allProperties.length === 0 && (
            <p className="text-sm text-gray-500">
              No properties yet. The first resort arrives via public signup.
            </p>
          )}
          {allProperties.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {p.name} <span className="font-mono text-xs text-gray-500">({p.id})</span>
                </p>
                {p.users.length === 0 ? (
                  <p className="truncate text-sm text-gray-500">no owner login yet</p>
                ) : (
                  <OwnerActions initial={p.users} />
                )}
              </div>
              <PropertyStatusToggle propertyId={p.id} initialStatus={p.status} />
            </div>
          ))}
        </Section>
      )}

      {isSuper && (
        <Section
          title="Onboarding re-runs"
          blurb="Each property gets one ingestion run. Approving unlocks exactly one more."
        >
          <OnboardingApprovals initial={initialRuns} approver={session.email ?? "super-admin"} />
        </Section>
      )}

      {isSuper && (
        <Section
          title="Recent activity"
          blurb="Who signed in, changed domains/keys/connections, or confirmed payments. Names and outcomes only — never secrets."
        >
          <AuditTrail properties={allProperties.map((p) => ({ id: p.id, name: p.name }))} />
        </Section>
      )}

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
                {approved.length > 0
                  ? approved.map((d) => d.domain).join(", ")
                  : "none yet — add one in Widget domains below."}
              </p>
            </div>
          );
        })}
      </Section>

      <Section
        title="Widget domains"
        blurb="Only these sites can host this property's chat widget. Deactivating a domain stops its widget on the next chat message."
      >
        <AdminDomains initial={initialDomains} initialPropertyId={propertyId} />
      </Section>

      <Section
        title="Staff bridge codes"
        blurb="Server-to-server snippets for client dashboards. Keys are minted below and stay on the client server."
      >
        <Snippet label="List open handoffs (curl)" text={bridgeExample} />
        <Snippet label="List open handoffs (Node)" text={bridgeNode} />
        <Snippet label="Staff widget embed (dashboard HTML)" text={staffWidgetSnippet} />
        <Snippet label="Mint the dashboard token (server, curl)" text={embedMintSnippet} />
        <p className="text-sm text-gray-500">
          Full contract (read, assign, close, notes, widget):{" "}
          <span className="font-mono">docs/bridge-integration.md</span> in the repo.
        </p>
      </Section>

      <Section
        title="Bridge keys"
        blurb="Server-to-server keys for this property's dashboards and staff widget. A key sees only this property's handoffs; the full token shows once, at mint time."
      >
        <BridgeTokens initial={initialTokens} initialPropertyId={propertyId} />
        <p className="text-sm text-gray-500">
          {tokenCount} active {tokenCount === 1 ? "key" : "keys"}. Revoking kills a key on its
          next call.
        </p>
      </Section>

      <Section
        title="Booking system"
        blurb="One connection per property: the address above is what answers your guests' price and availability questions. Test runs server-side and never reveals the key. Changes apply on the next chat message."
      >
        <SuiteBindings initial={initialBindings} initialPropertyId={propertyId} />
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

      {paymentsOn && (
        <Section
          title="Booking payments"
          blurb="Payment links the chatbot minted for held drafts. Confirm manual transfers here after verifying them; card links flip automatically when Stripe confirms."
        >
          <Payments
            initial={initialPayments}
            initialPropertyId={propertyId}
            stripe={{ mode: stripeMode, webhook: stripeWebhook }}
          />
        </Section>
      )}

      <Section
        title="Room catalogues"
        blurb="One room list per property. Rows govern chat once present; seed the demo file to start."
      >
        <RoomCatalogues initialPropertyId={propertyId} />
      </Section>

      <Section
        title="Secrets"
        blurb="Reserved room for secret configuration. Nothing to configure here yet."
      >
        <Later what="Secret rooms will live here (webhook signers and future integrations) once more of them need UI. Bridge keys already have their own room above." />
      </Section>

      <Section title="Security" blurb="What protects this app right now — live status, not promises.">
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
          {[
            ["Owner + super-admin logins (scrypt / signed session cookie)", true],
            [`Approved widget domains (${activeDomains.length} active)`, activeDomains.length > 0],
            ["Widget token handshake (per-message domain re-check)", true],
            [`Bridge keys (hashed, revocable, ${tokenCount} active)`, true],
            ["Staff widget tokens (15-minute, origin-bound)", true],
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
      </Section>

      {session.role === "SUPER_ADMIN" && (
        <Section
          title="Chatbot exam"
          blurb="The 18-case eval, runnable from here. Demo hotel only — a run can never touch real bookings. Same exam as the terminal runner."
        >
          <EvalRunner
            cases={(CASES as { id: string; category: string; turns: unknown[] }[]).map((c) => ({
              id: c.id,
              category: c.category,
              turns: c.turns.length,
            }))}
            commit={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}
          />
        </Section>
      )}

      <Section
        title="Profile"
        blurb={
          session.role === "SUPER_ADMIN"
            ? "Super-admin: every property, approvals, and the Admin page."
            : "Owner: this property only. Your password was set at registration."
        }
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Signed in as {session.email ?? "Super admin"}
            </p>
            <p className="text-sm text-gray-500">
              {session.role === "SUPER_ADMIN"
                ? "The bootstrap password lives in the deployment environment, not in the app."
                : `Sees ${property?.name ?? propertyId} only. No signup — properties are registered by the Vivereply team.`}
            </p>
          </div>
          <SignOutButton />
        </div>
        {me && <PasswordChange mustChange={me.mustChangePassword} />}
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
