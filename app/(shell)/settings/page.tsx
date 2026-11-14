// Settings (inside the shell route group). Session-protected: no valid
// session cookie means a redirect to /login. Single-property view —
// owners see only their own property, the super-admin may pass
// ?property=<id>. Since D1 this holds property profile, account &
// security, and link cards to the Chatbot section (which owns the
// chatbot/widget/bridge/booking rooms moved out of here).

import { redirect } from "next/navigation";
import { prismaService } from "@/lib/prisma";
import { getSession, resolvePropertyId, sessionOwnerVerified } from "@/lib/tenant";
import { withTenant } from "@/lib/tenant-db";
import SignOutButton from "../../components/SignOutButton";
import PasswordChange from "../../components/PasswordChange";
import TwoFactorSettings from "../../components/TwoFactorSettings";
import EvalRunner from "../../components/EvalRunner";
import VerifyPrompt from "../../components/VerifyPrompt";
import PropertyContact from "../../components/PropertyContact";
import OnboardingApprovals from "../../components/OnboardingApprovals";
import OwnerActions from "../../components/OwnerActions";
import PropertyStatusToggle from "../../components/PropertyStatusToggle";
import AuditTrail from "../../components/AuditTrail";
import { CASES } from "@/eval/cases.mjs";
import { securityChecklistRows } from "@/lib/security-checklist";

export const dynamic = "force-dynamic";

function Section({
  title,
  blurb,
  children,
  id,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
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
  // SERVICE PATH (marked): self-read by verified session uid (super-admin
  // rows carry no property, so no tenant could scope this read).
  const me =
    session.uid === "bootstrap"
      ? null
      : await prismaService().user
          .findUnique({ where: { id: session.uid }, select: { mustChangePassword: true } })
          .catch(() => null);
  // 2FA status for the settings section. Bootstrap reads the row setup
  // creates for ADMIN_EMAIL (absent = off); row users read their own.
  const twoFaRow =
    session.uid === "bootstrap" && session.email
      ? await prismaService().user
          .findUnique({
            where: { email: session.email },
            select: { totpSecretEnc: true, totpEnabledAt: true },
          })
          .catch(() => null)
      : session.uid === "bootstrap"
        ? null
        : await prismaService().user
            .findUnique({
              where: { id: session.uid },
              select: { totpSecretEnc: true, totpEnabledAt: true },
            })
            .catch(() => null);
  const twoFaEnabled = !!(twoFaRow?.totpSecretEnc && twoFaRow.totpEnabledAt);

  const [property, activeDomainCount, tokenCount, contactPhone] = await withTenant(propertyId, (tx) =>
    Promise.all([
      tx.property.findUnique({ where: { id: propertyId }, select: { id: true, name: true } }).catch(() => null),
      tx.approvedDomain.count({ where: { propertyId, active: true } }),
      tx.bridgeToken.count({ where: { propertyId, active: true } }),
      tx.propertyProfile.findUnique({ where: { propertyId }, select: { phone: true } }).catch(() => null),
    ])
  ).catch(() => [null, 0, 0, null] as const);
  // Super-admin oversight (relocated from the deleted /admin page):
  // cross-property tenants + onboarding approvals. Owners never fetch
  // these rows — the queries below run for super-admins only.
  const isSuper = session.role === "SUPER_ADMIN";
  // SERVICE PATH (marked): cross-property oversight scans.
  const allProperties = isSuper
    ? await prismaService().property
        .findMany({
          orderBy: { id: "asc" },
          include: { users: { select: { id: true, email: true, role: true, active: true } } },
        })
        .catch(() => [])
    : [];
  const initialRuns = isSuper
    ? await prismaService().onboardingRun
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">
          Configuration rooms for {property?.name ?? propertyId}. Real rooms work; rooms marked
          Later are reserved space for upcoming features. New here? Start with{" "}
          <a href="/setup" className="underline">
            Getting started
          </a>
          .
        </p>
      </header>

      <nav
        aria-label="Settings sections"
        className="sticky top-0 z-10 -mx-4 overflow-x-auto whitespace-nowrap border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur"
      >
        {(isSuper
          ? [
              ["tenants", "Tenants"],
              ["reruns", "Re-runs"],
              ["activity", "Activity"],
            ]
          : []
        )
          .concat([
            ["chatbot-section", "Chatbot"],
            ["secrets", "Secrets"],
            ["security", "Security"],
            ["exam", "Exam"],
            ["profile", "Profile"],
            ["appearance", "Appearance"],
          ])
          .map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="mr-4 text-sm text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              {label}
            </a>
          ))}
      </nav>

      {isSuper && (
        <Section
          id="tenants"
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
          id="reruns"
          title="Onboarding re-runs"
          blurb="Each property gets one ingestion run. Approving unlocks exactly one more."
        >
          <OnboardingApprovals initial={initialRuns} approver={session.email ?? "super-admin"} />
        </Section>
      )}

      {isSuper && (
        <Section
          id="activity"
          title="Recent activity"
          blurb="Who signed in or changed domains/keys/connections. Names and outcomes only — never secrets."
        >
          <AuditTrail properties={allProperties.map((p) => ({ id: p.id, name: p.name }))} />
        </Section>
      )}

      <Section
        id="chatbot-section"
        title="Chatbot"
        blurb="Name and topics, widget codes and domains, bridge keys, booking system and rooms now live under Chatbot in the sidebar."
      >
        <a
          href="/chatbot"
          className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
        >
          Open Chatbot settings →
        </a>
      </Section>

      <Section
        id="secrets"
        title="Secrets"
        blurb="Reserved room for secret configuration. Nothing to configure here yet."
      >
        <Later what="Secret rooms will live here (webhook signers and future integrations) once more of them need UI. Bridge keys already have their own room above." />
      </Section>

      <Section
        id="security"
        title="Security"
        blurb="What protects this app right now — live status, not promises."
      >
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
          {securityChecklistRows({
            activeDomainCount,
            bridgeTokenCount: tokenCount,
            twoFaEnabled,
          }).map((row) => (
            <p key={row.label} className="flex items-center justify-between gap-3 text-gray-900">
              <span>{row.label}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  row.on ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                }`}
              >
                {row.on ? "On" : "Off"}
              </span>
            </p>
          ))}
        </div>
      </Section>

      {session.role === "SUPER_ADMIN" && (
        <Section
          id="exam"
          title="Chatbot exam"
          blurb="The 19-case eval, runnable from here against the configured eval property. Same exam as the terminal runner."
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
        id="profile"
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
                : `Sees ${property?.name ?? propertyId} only. One login, one resort — nothing else is visible from here.`}
            </p>
          </div>
          <SignOutButton />
        </div>
        {me && <PasswordChange mustChange={me.mustChangePassword} />}
        <TwoFactorSettings enabled={twoFaEnabled} />
        {property && (
          <PropertyContact propertyId={property.id} propertyName={property.name} initialPhone={contactPhone?.phone ?? ""} />
        )}
      </Section>

      <Section
        id="appearance"
        title="Appearance"
        blurb="Reserved room for widget look-and-feel. Nothing to configure here yet."
      >
        <Later what="Widget theme controls (position, colors, greeting) will live here once the widget supports them." />
      </Section>
    </div>
  );
}
