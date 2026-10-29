"use client";

// "Booking system" Settings room: each property holds exactly one connection
// row — the Visible Record whose URL feeds chat. One booking backend per
// property; a backend may serve many properties, but a property never holds
// two connections (propertyId is unique server-side; POST 409s on a dup).
//
// The status line at the top is the owner's honest answer to "is my system
// live, or the demo default?" — fetched server-side from the same resolution
// the chat path uses, never revealing a secret.

import { useEffect, useState } from "react";

type Binding = {
  id: string;
  propertyId: string;
  suiteBaseUrl: string;
  version: number;
  secretSet: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  createdAt: string;
};

type Status = {
  backend: { source: "settings" | "demo-env" | "fixture" | "none"; baseUrl: string | null };
  catalogue: { source: "settings" | "demo-file" | "none"; rooms: number };
};

export default function SuiteBindings({
  initial,
  initialPropertyId,
}: {
  initial: Binding[];
  initialPropertyId: string;
}) {
  const [rows, setRows] = useState<Binding[]>(initial);
  const [status, setStatus] = useState<Status | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const mine = rows.find((r) => r.propertyId === initialPropertyId) ?? null;

  // Status banner: refresh after every save/delete so it always reflects reality.
  async function loadStatus() {
    setStatus(null);
    try {
      const r = await fetch(
        `/api/admin/integration/status?propertyId=${encodeURIComponent(initialPropertyId)}`
      );
      if (r.ok) setStatus((await r.json()) as Status);
    } catch {
      /* banner stays hidden on network failure; the connection card below still works */
    }
  }
  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPropertyId]);

  async function reload() {
    // Owners receive only their own property's row; super-admins receive all
    // and `mine` picks the page's current property — same as initial.
    const r = await fetch("/api/admin/suite-bindings");
    if (r.ok) setRows(await r.json());
    void loadStatus();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    // NOTE: PATCH treats secret "" as CLEAR, so the key is sent ONLY when
    // the box is non-empty — submitting an empty box keeps the stored key.
    const secretPart = secret ? { secret } : {};
    const r = await fetch("/api/admin/suite-bindings", {
      method: mine ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mine
          ? { id: mine.id, suiteBaseUrl: baseUrl || mine.suiteBaseUrl, ...secretPart }
          : { propertyId: initialPropertyId, suiteBaseUrl: baseUrl, ...secretPart }
      ),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(j.error ?? "Save failed.");
      return;
    }
    setEditing(false);
    setBaseUrl("");
    setSecret("");
    setMsg(
      r.status === 201
        ? "Saved. Your booking system now answers this property's guest chats."
        : "Saved. Changes apply to the next guest message."
    );
    void reload();
  }

  async function remove() {
    if (!mine) return;
    if (
      !confirm(
        "Remove this connection? The property falls back to the demo default until you add one again."
      )
    ) {
      return;
    }
    const r = await fetch("/api/admin/suite-bindings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: mine.id }),
    });
    if (r.ok) {
      setEditing(false);
      setBaseUrl("");
      setSecret("");
      setMsg("Connection removed. The property now uses the demo default.");
      void reload();
    } else {
      setMsg("Remove failed.");
    }
  }

  async function test() {
    if (!mine) return;
    setTesting(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/suite-bindings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mine.id }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(
        r.ok && j.ok
          ? `Connected in ${j.latencyMs}ms — your booking system answered${j.ping ? "" : " (reachable, older protocol)"}.`
          : (j.error ?? j.detail ?? "Connection test failed.")
      );
    } catch {
      setMsg("Connection test failed to reach the server.");
    } finally {
      setTesting(false);
    }
    void reload();
  }

  function startEdit() {
    if (!mine) return;
    setEditing(true);
    setBaseUrl(mine.suiteBaseUrl);
    setSecret(""); // Always starts EMPTY: submitting it untouched keeps the stored key.
    setMsg(
      mine.secretSet
        ? "Editing. Leave the Secret key box empty to keep your current key."
        : "Editing. No key is stored yet — paste one if your booking system needs it."
    );
  }

  const pill =
    "inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700";

  return (
    <div className="flex flex-col gap-3">
      {/* Status line: which system actually serves this property right now. */}
      {status && (
        <div
          role="status"
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
        >
          <p className="font-semibold text-gray-900">
            {status.backend.source === "settings" && "Your booking system is live."}
            {status.backend.source !== "settings" && "Your booking system is not connected yet."}
          </p>
          <p>
            {status.backend.source === "settings" &&
              `Guest questions on prices, availability, and bookings are answered from ${status.backend.baseUrl}.`}
            {status.backend.source === "demo-env" &&
              `Guest chats currently use the demo default (${status.backend.baseUrl}). Save your connection below to switch to your own system.`}
            {status.backend.source === "fixture" &&
              "This property answers from a built-in demo fixture, not a live booking system."}
            {status.backend.source === "none" &&
              "Guest chats currently have no booking backend — price and availability answers are disabled until you connect one."}
          </p>
          <p>
            {status.catalogue.source === "settings" &&
              `Room list: your own catalogue (${status.catalogue.rooms} rooms).`}
            {status.catalogue.source === "demo-file" &&
              `Room list: the demo catalogue (${status.catalogue.rooms} rooms) until you add your own in the Room catalogues room below.`}
            {status.catalogue.source === "none" &&
              "Room list: none yet — add rooms in the Room catalogues room below."}
          </p>
        </div>
      )}

      {mine ? (
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={pill}>{mine.suiteBaseUrl}</span>
            <span className={pill}>protocol v{mine.version}</span>
            <span className={pill}>{mine.secretSet ? "key stored" : "no key"}</span>
          </div>
          <p className="text-xs text-gray-500">
            {mine.propertyId}
            {mine.lastTestedAt
              ? ` · last tested ${new Date(mine.lastTestedAt).toLocaleString()} — ${mine.lastTestOk ? "answered" : "failed"}`
              : " · never tested"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void test()}
              disabled={testing}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button
              type="button"
              onClick={startEdit}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="rounded-lg border border-red-300 bg-white px-3 py-1 text-sm text-red-600"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No connection yet for <span className="font-mono">{initialPropertyId}</span>. Save one
          below to switch this property from the demo default to your own booking system.
        </p>
      )}

      {(!mine || editing) && (
        <form
          onSubmit={(e) => void save(e)}
          className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <p className="text-sm font-semibold text-gray-900">
            {editing ? "Edit connection" : "Connect your booking system"}
          </p>
          <p className="text-sm text-gray-700">
            Property: <span className="font-mono">{initialPropertyId}</span>
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Booking system address (https URL)
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://…"
              className="rounded-lg border border-gray-300 px-3 py-2 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {editing ? "Secret key (leave empty to keep the current key)" : "Secret key (optional)"}
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Paste the key your booking system gave you"
              autoComplete="new-password"
              className="rounded-lg border border-gray-300 px-3 py-2 font-mono"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-black px-4 py-2 text-sm text-white">
              {editing ? "Save changes" : "Save connection"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setBaseUrl("");
                  setSecret("");
                  setMsg(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
          {msg && (
            <p role="status" className="text-sm text-gray-700">
              {msg}
            </p>
          )}
        </form>
      )}
      {mine && !editing && msg && (
        <p role="status" className="text-sm text-gray-700">
          {msg}
        </p>
      )}
    </div>
  );
}
