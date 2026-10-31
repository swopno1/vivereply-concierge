// SetupWizard: the guided base-setup flow (account → property → domain
// → widget → booking → bridge). Every step shows its LIVE check result
// from /api/admin/setup-status — derived from rows, so progress survives
// leaving and resuming, and no step claims done without proof. Domain add
// and bridge mint run inline (same APIs as Settings); booking work happens
// in Settings with a re-check button here.
"use client";

import { useState } from "react";
import BridgeMint from "./BridgeMint";
import CopyButton from "./CopyButton";
import type { SetupState } from "@/lib/setup";

type Props = {
  initial: SetupState;
  propertyId: string;
  origin: string;
  statusUrl: string;
};

const PILL: Record<string, string> = {
  done: "bg-green-100 text-green-800",
  pending: "bg-gray-100 text-gray-700",
  optional: "bg-amber-50 text-amber-800",
};

export default function SetupWizard({ initial, propertyId, origin, statusUrl }: Props) {
  const [state, setState] = useState<SetupState>(initial);
  const [checking, setChecking] = useState(false);
  const [domain, setDomain] = useState("");
  const [domainMsg, setDomainMsg] = useState<string | null>(null);

  async function refresh() {
    setChecking(true);
    try {
      const r = await fetch(statusUrl);
      if (r.ok) setState((await r.json()) as SetupState);
    } finally {
      setChecking(false);
    }
  }

  async function addDomain() {
    setDomainMsg(null);
    const r = await fetch("/api/admin/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, propertyId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setDomainMsg(typeof j.error === "string" ? j.error : "Could not add that domain.");
      return;
    }
    setDomain("");
    await refresh();
  }

  const snippet = `<script src="${origin}/widget.js" data-key="${state.facts.widgetKey}"></script>`;

  return (
    <div className="flex flex-col gap-4">
      {state.complete && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-semibold text-green-900">Base setup complete.</p>
          <p className="text-sm text-green-800">
            Your chatbot can go live. Grab the{" "}
            <a className="underline" href="/setup/kit">
              integration kit
            </a>{" "}
            for your developer files.
          </p>
        </div>
      )}

      {state.steps.map((s) => (
        <section key={s.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">{s.title}</h2>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${PILL[s.status]}`}>
              {s.status === "done" ? "Done" : s.status === "pending" ? "To do" : "Optional"}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{s.detail}</p>

          {s.id === "property" && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <code className="text-xs text-gray-700">Property: {state.facts.propertyId}</code>
                <CopyButton text={state.facts.propertyId} label="property ID" />
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-gray-700">Widget key: {state.facts.widgetKey}</code>
                <CopyButton text={state.facts.widgetKey} label="widget key" />
              </div>
            </div>
          )}

          {s.id === "domain" && s.status === "pending" && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="www.yourresort.com"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void addDomain()}
                  className="rounded-full bg-black px-4 py-1.5 text-sm text-white"
                >
                  Add + activate
                </button>
              </div>
              {domainMsg && <p className="text-sm text-red-700">{domainMsg}</p>}
              <p className="text-xs text-gray-500">Just the host — no https://, no trailing path.</p>
            </div>
          )}

          {s.id === "widget" && (
            <div className="mt-2 flex flex-col gap-2">
              <pre className="overflow-x-auto rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-800">{snippet}</pre>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={snippet} label="widget snippet" />
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={checking}
                  className="rounded-full border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                >
                  {checking ? "Checking…" : "Check for loads"}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Paste before {"</body>"} on your site, open the chat panel once, then check.
              </p>
            </div>
          )}

          {s.id === "booking" && s.status === "pending" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href="/settings"
                className="rounded-full bg-black px-4 py-1.5 text-sm text-white"
              >
                Open Settings → Booking system
              </a>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={checking}
                className="rounded-full border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700 disabled:opacity-50"
              >
                {checking ? "Checking…" : "Re-check"}
              </button>
            </div>
          )}

          {s.id === "bridge" && s.status !== "done" && (
            <div className="mt-2">
              <BridgeMint propertyId={propertyId} />
            </div>
          )}
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={checking}
          className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 disabled:opacity-50"
        >
          {checking ? "Refreshing…" : "Refresh all checks"}
        </button>
        <a href="/setup/kit" className="text-sm text-gray-700 underline">
          Integration kit →
        </a>
      </div>
    </div>
  );
}
