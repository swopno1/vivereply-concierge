// Onboarding board (RAG engine setup, admin only). One property at a
// time: load its profile + run status, fill the business/identity form,
// upload documents (signed URLs straight to Storage — bytes never transit
// Vercel), submit once. A property that already ran is blocked with the
// approval path; an approver name + flip unlocks exactly one more run.
// PENDING runs can be re-invoked once the worker is configured.

"use client";

import { useState } from "react";

type Profile = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  assistantName: string;
  tone: string;
  languages: string;
  greeting: string;
};

type RunState = {
  id: string;
  propertyId: string;
  status: string;
  filePaths: string[];
  website: string | null;
  stats: Record<string, unknown> | null;
  error: string | null;
  approvedRerun: boolean;
  approvedBy: string | null;
};

const EMPTY_PROFILE: Profile = {
  businessName: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  assistantName: "",
  tone: "",
  languages: "",
  greeting: "",
};

const inputClass =
  "rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black";

export default function OnboardingBoard() {
  const [propertyId, setPropertyId] = useState("");
  const [loadedFor, setLoadedFor] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [run, setRun] = useState<RunState | null>(null);
  const [files, setFiles] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [approver, setApprover] = useState("");

  async function load(prop?: string) {
    const target = (prop ?? propertyId).trim();
    if (!target) return;
    setMessage("");
    setNotice("");
    const res = await fetch(`/api/admin/onboarding?propertyId=${encodeURIComponent(target)}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error || "Could not load onboarding state.");
      return;
    }
    setLoadedFor(target);
    setRun(data.run ?? null);
    setFiles([]);
    if (data.profile) {
      setProfile({
        businessName: data.profile.businessName ?? "",
        address: data.profile.address ?? "",
        phone: data.profile.phone ?? "",
        email: data.profile.email ?? "",
        website: data.profile.website ?? "",
        assistantName: data.profile.assistantName ?? "",
        tone: data.profile.tone ?? "",
        languages: Array.isArray(data.profile.languages) ? data.profile.languages.join(", ") : "",
        greeting: data.profile.greeting ?? "",
      });
    } else {
      setProfile(EMPTY_PROFILE);
    }
  }

  async function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0 || !loadedFor) return;
    setMessage("");
    setUploading(true);
    try {
      for (const file of Array.from(picked)) {
        const sign = await fetch("/api/admin/onboarding/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId: loadedFor, filename: file.name, size: file.size }),
        });
        const signed = await sign.json().catch(() => null);
        if (!sign.ok) throw new Error(signed?.error || `Could not stage ${file.name}.`);
        const put = await fetch(signed.uploadUrl, { method: "PUT", body: file });
        if (!put.ok) throw new Error(`Upload of ${file.name} failed.`);
        setFiles((f) => (f.some((x) => x.path === signed.path) ? f : [...f, { name: file.name, path: signed.path }]));
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!loadedFor || sending) return;
    setMessage("");
    setNotice("");
    setSending(true);
    try {
      const res = await fetch("/api/admin/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: loadedFor,
          profile: {
            businessName: profile.businessName,
            address: profile.address,
            phone: profile.phone,
            email: profile.email,
            website: profile.website || undefined,
            assistantName: profile.assistantName,
            tone: profile.tone,
            languages: profile.languages.split(",").map((l) => l.trim()).filter(Boolean),
            greeting: profile.greeting,
          },
          website: profile.website || undefined,
          filePaths: files.map((f) => f.path),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not submit onboarding.");
      setNotice(data.worker?.note ?? "Submitted.");
      await load(loadedFor);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not submit onboarding.");
    } finally {
      setSending(false);
    }
  }

  async function approve(approveIt: boolean) {
    if (!loadedFor) return;
    setMessage("");
    const res = await fetch("/api/admin/onboarding/approve", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: loadedFor, approve: approveIt, approvedBy: approver }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error || "Approval failed.");
      return;
    }
    setApprover("");
    await load(loadedFor);
  }

  async function invoke() {
    if (!loadedFor) return;
    setMessage("");
    setNotice("");
    const res = await fetch("/api/admin/onboarding/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: loadedFor }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error || "Invoke failed.");
      return;
    }
    setNotice(data.note ?? "Invoked.");
    await load(loadedFor);
  }

  const blocked = run !== null && !run.approvedRerun;
  const stats = run?.stats;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Onboarding</h1>
        <p className="text-sm text-gray-500">
          One guided run per property fills its knowledge base: business form, website,
          documents. Further runs need an approval below.
        </p>
      </header>

      <div className="flex gap-2">
        <input
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="new-property-id"
          className={`flex-1 ${inputClass}`}
        />
        <button
          onClick={() => load()}
          disabled={!propertyId.trim()}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Load
        </button>
      </div>
      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}

      {loadedFor && run && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">
            Run status: {run.status}
            {run.approvedRerun && <span className="ml-2 text-green-700">(re-run approved{run.approvedBy ? ` by ${run.approvedBy}` : ""})</span>}
          </p>
          {stats !== null && typeof stats === "object" && (
            <p className="text-sm text-gray-500">
              {[
                stats.pagesVisited !== undefined ? `${String(stats.pagesVisited)} pages` : "",
                stats.docsParsed !== undefined ? `${String(stats.docsParsed)} docs` : "",
                stats.chunksWritten !== undefined ? `${String(stats.chunksWritten)} chunks` : "",
                stats.embedTokensEstimated !== undefined ? `~${Number(stats.embedTokensEstimated).toLocaleString()} embed tokens` : "",
              ]
                .filter(Boolean)
                .join(" · ") || "No stats yet."}
              {typeof stats.truncated === "boolean" && stats.truncated ? " · stopped at budget cap" : ""}
            </p>
          )}
          {run.error && <p className="text-sm text-red-700">{run.error}</p>}
          {run.status === "PENDING" && (
            <button onClick={invoke} className="self-start rounded-full border px-4 py-1 text-sm">
              Send to worker
            </button>
          )}
        </div>
      )}

      {loadedFor && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-gray-900">Business + reply identity</h2>
          <input value={profile.businessName} onChange={(e) => setProfile({ ...profile, businessName: e.target.value })} placeholder="Business name *" className={inputClass} />
          <div className="flex gap-2">
            <input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Address" className={`flex-1 ${inputClass}`} />
            <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="Phone" className={`flex-1 ${inputClass}`} />
          </div>
          <div className="flex gap-2">
            <input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="Email" className={`flex-1 ${inputClass}`} />
            <input value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} placeholder="https://website (crawled if no knowledge API)" className={`flex-1 ${inputClass}`} />
          </div>
          <div className="flex gap-2">
            <input value={profile.assistantName} onChange={(e) => setProfile({ ...profile, assistantName: e.target.value })} placeholder="Assistant name (e.g. Aria)" className={`flex-1 ${inputClass}`} />
            <input value={profile.languages} onChange={(e) => setProfile({ ...profile, languages: e.target.value })} placeholder="Languages (comma, e.g. en, bn)" className={`flex-1 ${inputClass}`} />
          </div>
          <input value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })} placeholder="Tone (e.g. warm, short replies, formal Bengali)" className={inputClass} />
          <input value={profile.greeting} onChange={(e) => setProfile({ ...profile, greeting: e.target.value })} placeholder="Greeting line (optional)" className={inputClass} />

          <h2 className="text-lg font-bold text-gray-900">Documents</h2>
          <label className="cursor-pointer self-start rounded-full border px-5 py-2 text-sm hover:bg-gray-50">
            {uploading ? "Uploading…" : "Choose files (pdf, md, txt, xlsx, xls, docx, csv)"}
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {files.length > 0 && (
            <div className="flex flex-col gap-1">
              {files.map((f) => (
                <p key={f.path} className="text-sm text-gray-700">
                  ✓ {f.name}
                </p>
              ))}
            </div>
          )}
          {run && run.filePaths.length > 0 && files.length === 0 && (
            <p className="text-sm text-gray-500">{run.filePaths.length} file(s) attached to this run.</p>
          )}

          {blocked ? (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-700">
                This property already used its one run. An approval unlocks exactly one more.
              </p>
              <div className="flex gap-2">
                <input
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                  placeholder="Approver name"
                  className={`flex-1 ${inputClass}`}
                />
                <button onClick={() => approve(true)} disabled={!approver.trim()} className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40">
                  Approve re-run
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={submit}
              disabled={sending || !profile.businessName.trim()}
              className="self-start rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {run ? "Submit approved re-run" : "Start ingestion run"}
            </button>
          )}
          {run?.approvedRerun && (
            <button onClick={() => approve(false)} className="self-start text-sm text-gray-500 underline">
              Revoke the pending approval
            </button>
          )}
        </div>
      )}
    </div>
  );
}
