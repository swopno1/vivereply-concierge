// Onboarding re-run approvals UI (super-admin only). Client component used
// by the /admin ops page. Each property gets exactly one ingestion run;
// this board unlocks exactly one more per approval (the flip is consumed
// by the next submit). Owners can never see this board — the API rejects
// non-super-admin calls, and /admin itself redirects owners away.

"use client";

import { useState } from "react";

export type OnboardingRunRow = {
  propertyId: string;
  status: string;
  approvedRerun: boolean;
  approvedBy: string | null;
  updatedAt: string;
};

export default function OnboardingApprovals({
  initial,
  approver,
}: {
  initial: OnboardingRunRow[];
  approver: string;
}) {
  const [rows, setRows] = useState<OnboardingRunRow[]>(initial);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  async function flip(propertyId: string, approve: boolean) {
    setMessage("");
    setSending(propertyId);
    try {
      const res = await fetch("/api/admin/onboarding/approve", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, approve, approvedBy: approver }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not update the approval.");
      setRows((current) =>
        current.map((r) =>
          r.propertyId === propertyId
            ? { ...r, approvedRerun: data.approvedRerun === true, approvedBy: data.approvedBy ?? null }
            : r
        )
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not update the approval.");
    } finally {
      setSending(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No onboarding runs yet. Runs appear here after the first submit from Onboarding.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      {rows.map((r) => (
        <div
          key={r.propertyId}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{r.propertyId}</p>
            <p className="text-sm text-gray-500">
              {r.status}
              {r.approvedRerun ? ` · re-run approved by ${r.approvedBy ?? "admin"}` : " · one run used"}
            </p>
          </div>
          <button
            onClick={() => flip(r.propertyId, !r.approvedRerun)}
            disabled={sending === r.propertyId}
            className="shrink-0 rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {r.approvedRerun ? "Revoke" : "Approve re-run"}
          </button>
        </div>
      ))}
    </div>
  );
}
