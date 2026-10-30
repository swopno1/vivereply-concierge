// Integration kit (server): the standalone developer reference — script
// tag with key pre-filled, the 5 spec-v1 backend endpoints, curl for
// ping + bridge, inline bridge mint. Same scope rules as /setup.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, resolvePropertyId, sessionOwnerVerified } from "@/lib/tenant";
import { getSetupFacts } from "@/lib/setup";
import BridgeMint from "../../../components/BridgeMint";
import CopyButton from "../../../components/CopyButton";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Pre({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <pre className="overflow-x-auto rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-800">{text}</pre>
      <div>
        <CopyButton text={text} label={label} />
      </div>
    </div>
  );
}

export default async function KitPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const facts = await getSetupFacts(propertyId, await sessionOwnerVerified(session));
  if (!facts) redirect("/settings");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.vivereply.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const snippet = `<script src="${origin}/widget.js" data-key="${facts.widgetKey}"></script>`;
  const binding = facts.binding;
  const pingCurl = [
    `# Ping YOUR backend the way Concierge does (spec v1, HTTPS, 15s budget):`,
    `curl -s -m 15 -w '\\nHTTP %{http_code}\\n' \\`,
    `  "${binding ? binding.suiteBaseUrl.replace(/\/$/, "") : "https://suite.example.com"}/api/concierge/ping" \\`,
    binding?.hasSecret ? `  -H "Authorization: Bearer <suite-secret>"` : `  # add -H "Authorization: Bearer <secret>" if your backend needs one`,
  ].join("\n");
  const bridgeCurl = [
    `# Test a bridge key from YOUR server (never the browser):`,
    `curl -s "${origin}/api/bridge/handoffs?status=OPEN" \\`,
    `  -H "Authorization: Bearer <bridge-key>"`,
  ].join("\n");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Integration kit</h1>
        <p className="text-sm text-gray-600">
          {facts.propertyName} ({facts.propertyId}) · everything your developer needs, pre-filled.
          Full contracts live in docs/suite-api-spec.md (backend v1) and docs/bridge-integration.md
          (staff API).
        </p>
      </div>

      <Block title="1 · Widget snippet">
        <p className="text-sm text-gray-600">
          Paste this plain script tag before {"</body>"} on every approved page. It must stay a
          synchronous tag — async or defer breaks the key detection — and only runs on hosts you
          approved in the wizard.
        </p>
        <Pre text={snippet} label="widget snippet" />
        <p className="text-xs text-gray-500">
          HTTPS site required in production; keep your Content-Security-Policy open to {origin} for
          script + frame + connect.
        </p>
      </Block>

      <Block title="2 · Backend endpoints (spec v1)">
        <p className="text-sm text-gray-600">
          Your booking system implements these five; all money is integer minor units (poisha),
          HTTPS only, and every call must answer within 15 seconds.
        </p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-gray-700">
          <li>
            <code className="text-xs">GET /api/concierge/ping</code> →{" "}
            <code className="text-xs">{"{ok:true}"}</code> with HTTP 200.
          </li>
          <li>
            <code className="text-xs">GET /api/rooms/&lt;roomId&gt;/availability?checkIn=&amp;checkOut=</code>{" "}
            → nightly rates + remaining count per date.
          </li>
          <li>
            <code className="text-xs">POST /api/bookings</code> → booking hold (code, totals, expiry).
            Concierge sends an idempotency key; replays return the same hold.
          </li>
          <li>
            <code className="text-xs">GET /api/bookings/lookup?code=RES-…</code> → booking facts for a
            guest who quotes their code (looks up by code + minimal guest proof).
          </li>
          <li>
            <code className="text-xs">POST /api/bookings/send-details</code> → re-sends the booking
            confirmation to the guest&apos;s contact (lookup itself never leaks details).
          </li>
        </ol>
      </Block>

      <Block title="3 · curl: ping your backend">
        <Pre text={pingCurl} label="ping curl" />
      </Block>

      <Block title="4 · Bridge key (staff API, optional)">
        <p className="text-sm text-gray-600">
          Mint below, copy once, store on your server. Scoped to this property only; revoke in
          Settings → Bridge tokens any time. The bot never sees it and it must never reach a
          browser.
        </p>
        <BridgeMint propertyId={propertyId} />
        <Pre text={bridgeCurl} label="bridge curl" />
        <p className="text-xs text-gray-500">
          Staff handoffs have three paths: this bridge API from your own dashboard, the hosted
          /staff board, or the /staff/embed iframe (mint 15-minute tokens server-side via
          POST /api/bridge/embed-tokens).
        </p>
      </Block>

      <Block title="5 · Go-live checklist">
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-gray-700">
          <li>Domain ACTIVE in the wizard — the chat button renders only there.</li>
          <li>Widget opens on your live site (the wizard counts opens).</li>
          <li>Booking Test in Settings is green and rooms are mapped.</li>
          <li>One real quote → hold loop matches your backend totals exactly.</li>
          <li>Staff knows the handoff path (board, embed, or bridge).</li>
        </ol>
      </Block>
    </main>
  );
}
