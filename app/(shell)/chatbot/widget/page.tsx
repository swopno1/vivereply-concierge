// Chatbot → Widget & keys (D1): the settings widget-codes, domains,
// bridge-codes and bridge-keys blocks, moved whole. Same reads, same
// components, same verified-owner gate as settings.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, resolvePropertyId, sessionOwnerVerified } from "@/lib/tenant";
import { getChatbotData } from "@/lib/dashboard";
import VerifyPrompt from "../../../components/VerifyPrompt";
import AdminDomains from "../../../components/AdminDomains";
import BridgeTokens from "../../../components/BridgeTokens";
import ChatbotSubnav from "../ChatbotSubnav";
import { Section, Snippet } from "../_sections";

export default async function ChatbotWidgetPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/chatbot/widget");
  if (!(await sessionOwnerVerified(session))) {
    return <VerifyPrompt email={session.email} />;
  }
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const data = await getChatbotData(propertyId);
  if (!data) redirect("/settings");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.vivereply.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const snippet = data.widgetKey ? `<script src="${origin}/widget.js" data-key="${data.widgetKey}"></script>` : null;
  const approved = data.domains.filter((d) => d.active);
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Widget &amp; keys</h1>
        <p className="text-sm text-gray-500">Embed snippet, approved domains, bridge keys for {data.propertyName}.</p>
      </header>
      <ChatbotSubnav />

      <Section
        id="widget-codes"
        title="Chat widget codes"
        blurb="One script tag per key. It only runs on that property's approved domains."
      >
        {snippet ? (
          <div className="flex flex-col gap-2">
            <Snippet label={`${data.propertyName} (${data.widgetKey})`} text={snippet} />
            <p className="text-sm text-gray-500">
              Approved domains:{" "}
              {approved.length > 0
                ? approved.map((d) => d.domain).join(", ")
                : "none yet — add one in Widget domains below."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No widget key on this property yet.</p>
        )}
      </Section>

      <Section
        id="domains"
        title="Widget domains"
        blurb="Only these sites can host this property's chat widget. Deactivating a domain stops its widget on the next chat message."
      >
        <AdminDomains initial={data.domains} initialPropertyId={propertyId} />
      </Section>

      <Section
        id="bridge-codes"
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
        id="bridge-keys"
        title="Bridge keys"
        blurb="Server-to-server keys for this property's dashboards and staff widget. A key sees only this property's handoffs; the full token shows once, at mint time."
      >
        <BridgeTokens initial={data.tokens} initialPropertyId={propertyId} />
        <p className="text-sm text-gray-500">
          {data.activeTokenCount} active {data.activeTokenCount === 1 ? "key" : "keys"}. Revoking kills a key on its
          next call.
        </p>
      </Section>
    </div>
  );
}
