// Tenant Home (D1 dashboard landing). Server component: per-property
// status at a glance, everything from existing reads (billing snapshot,
// binding, conversation + handoff counts). Renders the first-run
// checklist instead of the cards until setup completes. Super-admins
// without ?property= get a picker hint (no property in scope).
// Signed-out visitors go to login — no public demo.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, resolvePropertyId } from "@/lib/tenant";
import { getHomeData } from "@/lib/dashboard";
import CopyButton from "../components/CopyButton";
import TestConnectionButton from "../components/TestConnectionButton";

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">{children}</section>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/");
  const params = (await searchParams) ?? {};
  let propertyId: string;
  try {
    propertyId = await resolvePropertyId(session, params.property);
  } catch {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900">Home</h1>
        <p className="text-sm text-gray-600">
          Super-admins open Home per property — pick one in{" "}
          <a href="/settings#tenants" className="underline">
            Settings → Tenants
          </a>
          , or append <span className="font-mono">?property=&lt;id&gt;</span> to this URL.
        </p>
      </main>
    );
  }
  const data = await getHomeData(propertyId);
  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900">Home</h1>
        <p className="text-sm text-gray-600">Couldn&apos;t load this property right now. Try again in a moment.</p>
      </main>
    );
  }

  if (data.checklist) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Get {data.propertyName} answering guests</h1>
          <p className="text-sm text-gray-600">Four steps — each ticks off from real state as you finish it.</p>
        </div>
        <ol className="flex flex-col gap-2">
          {data.checklist.map((step, i) => (
            <li
              key={step.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done ? "bg-green-600 text-white" : "bg-gray-200 text-gray-600"
                }`}
              >
                {step.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{step.label}</span>
              </span>
              <a href={step.href} className="shrink-0 text-sm text-gray-900 underline underline-offset-2">
                {step.done ? "Review" : "Start"}
              </a>
            </li>
          ))}
        </ol>
      </main>
    );
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.vivereply.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const snap = data.snapshot;
  const paused = !snap.gate.allowed;
  const usagePct = snap.quotaThisMonth > 0 ? Math.min(100, Math.round((snap.usageThisMonth / snap.quotaThisMonth) * 100)) : 0;
  const suiteHost = data.binding ? hostOf(data.binding.suiteBaseUrl) : null;
  const renewal = fmtDate(snap.currentPeriodEnd) ?? fmtDate(snap.trialEndsAt);
  const embedSnippet = data.widgetKey ? `<script src="${origin}/widget.js" data-key="${data.widgetKey}"></script>` : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900">{data.propertyName}</h1>

      {data.attention.length > 0 && (
        <div className="flex flex-col gap-2" role="alert" aria-label="Needs attention">
          {data.attention.map((item) => (
            <p
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
            >
              <span>{item.text}</span>
              <a href={item.href} className="font-semibold underline underline-offset-2">
                Fix now
              </a>
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Chatbot</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {paused ? "Paused" : "Live"}
            {paused && snap.gate.reason === "trial-expired" ? " · trial ended" : ""}
            {paused && snap.gate.reason === "quota-exceeded" ? " · limit reached" : ""}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {snap.usageThisMonth.toLocaleString()} / {snap.quotaThisMonth.toLocaleString()} conversations
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200" role="img" aria-label={`${usagePct}% of quota used`}>
            <div className="h-full rounded-full bg-gray-900" style={{ width: `${usagePct}%` }} />
          </div>
          <p className="mt-2 text-sm text-gray-600">{snap.tier} plan</p>
          <a href="/chatbot" className="mt-2 inline-block text-sm font-medium text-gray-900 underline underline-offset-2">
            Open Chatbot
          </a>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Suite</p>
          {data.binding ? (
            <>
              <p className="mt-1 text-lg font-bold text-gray-900">Connected</p>
              <p className="mt-1 truncate text-sm text-gray-600">{suiteHost ?? data.binding.suiteBaseUrl}</p>
              <a
                href={data.binding.suiteBaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm font-medium text-gray-900 underline underline-offset-2"
              >
                Open my Suite
              </a>
            </>
          ) : (
            <>
              <p className="mt-1 text-lg font-bold text-gray-900">Not connected</p>
              <p className="mt-1 text-sm text-gray-600">Link your booking system to answer price questions.</p>
              <a href="/chatbot/booking" className="mt-2 inline-block text-sm font-medium text-gray-900 underline underline-offset-2">
                Connect
              </a>
            </>
          )}
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">RoomReady</p>
          <p className="mt-1 text-lg font-bold text-gray-900">Coming soon</p>
          <p className="mt-1 text-sm text-gray-600">Room readiness, in this dashboard when it ships.</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">
            {snap.hasSubscription ? `${snap.tier} plan` : "No billing record — full access"}
            {renewal ? <span className="font-normal text-gray-600"> · renews {renewal}</span> : null}
            {snap.status === "TRIAL" ? (
              <span className="font-normal text-gray-600">
                {" "}
                · trial ends {fmtDate(snap.trialEndsAt) ?? `${snap.trialDaysLeft} days left`}
              </span>
            ) : null}
          </p>
          <a href="/billing" className="text-sm font-medium text-gray-900 underline underline-offset-2">
            Orders &amp; Billing
          </a>
        </div>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Recent activity</p>
        <p className="mt-1 text-sm text-gray-900">
          {data.conversationsWeek.toLocaleString()} conversations this week · {data.conversationsMonth.toLocaleString()} this month
        </p>
        <p className="mt-1 text-sm text-gray-900">
          {data.openHandoffs} open {data.openHandoffs === 1 ? "handoff" : "handoffs"}
          {data.binding && data.openHandoffs > 0 ? (
            <>
              {" · "}
              <a
                href={`${data.binding.suiteBaseUrl.replace(/\/$/, "")}/admin/chatbot-admin`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Open Suite board
              </a>
            </>
          ) : null}
        </p>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Quick actions</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <a href="/setup/kit" className="text-sm font-medium text-gray-900 underline underline-offset-2">
            Preview widget
          </a>
          {data.bindingId ? (
            <TestConnectionButton bindingId={data.bindingId} />
          ) : (
            <a href="/chatbot/booking" className="text-sm font-medium text-gray-900 underline underline-offset-2">
              Connect booking system
            </a>
          )}
          {embedSnippet ? (
            <CopyButton text={embedSnippet} label="embed code" />
          ) : (
            <span className="text-sm text-gray-500">No widget key yet</span>
          )}
        </div>
      </Card>
    </main>
  );
}
