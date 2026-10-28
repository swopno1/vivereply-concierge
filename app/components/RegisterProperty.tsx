// Property registration form UI (auth Tier 1, super-admin only). Client
// component used by /admin/register. One submit creates the property, its
// domains, and its owner login; the temporary owner password shows ONCE in
// the success panel (copy it to the owner over a safe channel — it is never
// stored or shown again). Bedrooms (rooms/backend) are configured
// afterwards in Settings, like every other property.

"use client";

import { useState } from "react";

export default function RegisterProperty() {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [widgetKey, setWidgetKey] = useState("");
  const [domains, setDomains] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ propertyId: string; ownerEmail: string; tempPassword: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (sending) return;
    setMessage("");
    setResult(null);
    if (!id.trim() || !name.trim() || !widgetKey.trim() || !ownerEmail.trim()) {
      setMessage("Property ID, name, widget key, and owner email are required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id.trim(),
          name: name.trim(),
          widgetKey: widgetKey.trim(),
          domains: domains.split(",").map((d) => d.trim()).filter(Boolean),
          ownerEmail: ownerEmail.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not register the property.");
      setResult(data);
      setId("");
      setName("");
      setWidgetKey("");
      setDomains("");
      setOwnerEmail("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not register the property.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      {result && (
        <div className="flex flex-col gap-2 rounded-xl border border-green-300 bg-green-50 px-4 py-3">
          <p className="text-sm font-semibold text-green-900">
            Registered {result.propertyId} — owner {result.ownerEmail}
          </p>
          <p className="text-sm text-green-800">
            Temporary password (shown ONCE — copy it now, it is never shown again):
          </p>
          <p className="select-all rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold text-gray-900">
            {result.tempPassword}
          </p>
          <p className="text-sm text-green-800">
            The owner replaces it on first Settings visit. Rooms and backend next, in Settings.
          </p>
        </div>
      )}
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="Property ID (e.g. harbor-inn)"
        className="rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Property name (e.g. Harbor Inn)"
        className="rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
      />
      <div className="flex gap-2">
        <input
          value={widgetKey}
          onChange={(e) => setWidgetKey(e.target.value)}
          placeholder="Widget key (e.g. key-harbor-inn)"
          className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
        />
        <input
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Owner email"
          type="email"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
        />
      </div>
      <input
        value={domains}
        onChange={(e) => setDomains(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Domains, comma-separated (e.g. harbor.example.com) — optional"
        className="rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
      />
      <button
        onClick={submit}
        disabled={sending}
        className="self-start rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        Register property
      </button>
    </div>
  );
}
