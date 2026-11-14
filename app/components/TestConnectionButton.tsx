// Home quick action: runs the existing booking-system connection test
// (POST /api/admin/suite-bindings/test) and reports the result inline.
// No new endpoint, no logic change — same call SuiteBindings makes.

"use client";

import { useState } from "react";

export default function TestConnectionButton({ bindingId }: { bindingId: string }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (testing) return;
    setTesting(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/suite-bindings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bindingId }),
      });
      const j = await r.json().catch(() => ({}));
      setResult(
        r.ok && j.ok
          ? `Connected in ${j.latencyMs}ms — your booking system answered.`
          : (j.error ?? j.detail ?? "Connection test failed.")
      );
    } catch {
      setResult("Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={testing}
        className="text-sm font-medium text-gray-900 underline underline-offset-2 disabled:opacity-60"
      >
        {testing ? "Testing…" : "Test connection"}
      </button>
      {result && <span className="text-sm text-gray-600">{result}</span>}
    </span>
  );
}
