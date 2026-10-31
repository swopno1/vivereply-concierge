// Inline bridge-key minting (mint → copy once → done). Shared by the
// setup wizard and the integration kit. The token is shown once and
// never stored in the browser; the server keeps only its hash.
"use client";

import { useState } from "react";
import CopyButton from "./CopyButton";

export default function BridgeMint({ propertyId }: { propertyId: string }) {
  const [name, setName] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function mint() {
    setMsg(null);
    setMinted(null);
    const r = await fetch("/api/admin/bridge-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "staff dashboard", propertyId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.token !== "string") {
      setMsg(typeof j.error === "string" ? j.error : "Could not mint a key.");
      return;
    }
    setMinted(j.token as string);
    setName("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name, e.g. staff dashboard"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => void mint()}
          className="rounded-full bg-black px-4 py-1.5 text-sm text-white"
        >
          Mint key
        </button>
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      {minted && (
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs font-semibold text-gray-900">
            Copy now — this is shown once, then unrecoverable:
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="break-all text-xs text-gray-800">{minted}</code>
            <CopyButton text={minted} label="bridge key" />
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Store it on your own server. It works only for this property and stops the moment you revoke it.
          </p>
        </div>
      )}
    </div>
  );
}
