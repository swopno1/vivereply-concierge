// Suite-binding manager UI (adapter Phase 2). Client component used by
// the protected /settings server page. One binding per property: base URL
// + optional backend key (stored encrypted, shown nowhere — not even here)
// + Test connection, which runs fully server-side and reports ok/fail plus
// latency. Editing a binding never displays the current secret: typing a
// new one replaces it, leaving it blank keeps it, clearing is explicit.

"use client";

import { useState } from "react";

export type SuiteBindingRow = {
  id: string;
  propertyId: string;
  suiteBaseUrl: string;
  version: number;
  secretSet: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  createdAt: string;
};

type TestResult = { ok: boolean; ping: boolean; latencyMs: number; detail: string };

export default function SuiteBindings({ initial }: { initial: SuiteBindingRow[] }) {
  const [rows, setRows] = useState<SuiteBindingRow[]>(initial);
  const [propertyId, setPropertyId] = useState("");
  const [suiteBaseUrl, setSuiteBaseUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [sending, setSending] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/suite-bindings");
    if (res.ok) setRows(await res.json());
  }

  function startEdit(row: SuiteBindingRow) {
    setEditingId(row.id);
    setPropertyId(row.propertyId);
    setSuiteBaseUrl(row.suiteBaseUrl);
    setSecret("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setPropertyId("");
    setSuiteBaseUrl("");
    setSecret("");
    setMessage("");
  }

  async function save() {
    if (!propertyId.trim() || !suiteBaseUrl.trim() || sending) return;
    setMessage("");
    setSending(true);
    try {
      if (editingId) {
        const res = await fetch("/api/admin/suite-bindings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            suiteBaseUrl,
            ...(secret ? { secret } : {}),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Could not save binding.");
      } else {
        const res = await fetch("/api/admin/suite-bindings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, suiteBaseUrl, secret }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Could not add binding.");
      }
      cancelEdit();
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save binding.");
    } finally {
      setSending(false);
    }
  }

  async function remove(row: SuiteBindingRow) {
    if (!window.confirm(`Remove the ${row.propertyId} backend binding?`)) return;
    const res = await fetch("/api/admin/suite-bindings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    });
    if (res.ok) await refresh();
  }

  async function test(row: SuiteBindingRow) {
    setTestingId(row.id);
    setTestResults((r) => {
      const next = { ...r };
      delete next[row.id];
      return next;
    });
    try {
      const res = await fetch("/api/admin/suite-bindings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const data = (await res.json().catch(() => null)) as TestResult | null;
      if (data && typeof data.ok === "boolean") {
        setTestResults((r) => ({ ...r, [row.id]: data }));
      }
      await refresh();
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-300 p-4">
        <p className="font-semibold">{editingId ? "Edit binding" : "Add a backend binding"}</p>
        <input
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          placeholder="krishnachura-retreat"
          disabled={editingId !== null}
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black disabled:opacity-50"
        />
        <input
          value={suiteBaseUrl}
          onChange={(e) => setSuiteBaseUrl(e.target.value)}
          placeholder="https://demo1.vivereply.com"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={editingId ? "New backend key (blank keeps current)" : "Backend key (blank for keyless)"}
          autoComplete="new-password"
          className="rounded-full border px-4 py-2 text-sm outline-none focus:border-black"
        />
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={sending || !propertyId.trim() || !suiteBaseUrl.trim()}
            className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {editingId ? "Save binding" : "Add binding"}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="rounded-full border px-5 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
        {message && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="text-sm text-gray-500">
            No bindings yet — the demo property falls back to its env URL until you add one.
          </p>
        )}
        {rows.map((row) => {
          const result = testResults[row.id];
          return (
            <div
              key={row.id}
              className="flex flex-col gap-2 rounded-xl border border-gray-300 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{row.propertyId}</p>
                  <p className="font-mono text-sm text-gray-500">{row.suiteBaseUrl}</p>
                  <p className="text-sm text-gray-500">
                    suite v{row.version} · key {row.secretSet ? "set" : "not set"} ·{" "}
                    {row.lastTestedAt
                      ? `last test ${row.lastTestOk ? "passed" : "failed"}`
                      : "never tested"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => test(row)}
                    disabled={testingId === row.id}
                    className="rounded-full border px-4 py-1 text-sm disabled:opacity-40"
                  >
                    {testingId === row.id ? "Testing…" : "Test"}
                  </button>
                  <button onClick={() => startEdit(row)} className="rounded-full border px-4 py-1 text-sm">
                    Edit
                  </button>
                  <button onClick={() => remove(row)} className="rounded-full border px-4 py-1 text-sm">
                    Remove
                  </button>
                </div>
              </div>
              {result && (
                <p
                  className={`rounded-lg px-3 py-2 text-sm ${
                    result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
                  }`}
                >
                  {result.detail} ({result.latencyMs}ms
                  {result.ok && !result.ping ? ", no ping endpoint" : ""})
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
