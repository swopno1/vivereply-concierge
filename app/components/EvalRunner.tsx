// Eval runner card for Settings (client: drives the run case by case).
// Super-admin only, fixture property only — the API route enforces both,
// this component just never renders for anyone else. One case per request
// (the route's design), looped here for a full set, with live progress.
// Results stay on this page: copy the JSON before leaving. Unpolished by
// decision — function first, looks later.

"use client";

import { useMemo, useState } from "react";
import CopyButton from "./CopyButton";

export type EvalCaseInfo = { id: string; category: string; turns: number };
type CaseResult = {
  id: string;
  category: string;
  pass: boolean;
  failures: string[];
  softWarnings: string[];
};

export default function EvalRunner({ cases, commit }: { cases: EvalCaseInfo[]; commit: string }) {
  const [selection, setSelection] = useState<string>("__full__");
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const selected = useMemo(
    () => (selection === "__full__" ? cases : cases.filter((c) => c.id === selection)),
    [selection, cases]
  );

  async function run() {
    setRunning(true);
    setResults([]);
    setRunError(null);
    setStartedAt(new Date().toISOString());
    try {
      for (const c of selected) {
        setCurrent(c.id);
        const res = await fetch("/api/admin/eval/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: c.id }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || typeof data.pass !== "boolean") {
          throw new Error(
            (data && typeof data.error === "string" && data.error) ||
              `Case ${c.id} failed with status ${res.status}.`
          );
        }
        setResults((prev) => [
          ...prev,
          {
            id: data.id,
            category: data.category,
            pass: data.pass,
            failures: data.failures ?? [],
            softWarnings: data.softWarnings ?? [],
          },
        ]);
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "The run stopped early.");
    } finally {
      setCurrent(null);
      setRunning(false);
    }
  }

  const rates = useMemo(() => {
    const cats = [...new Set(results.map((r) => r.category))];
    return cats.map((cat) => {
      const inCat = results.filter((r) => r.category === cat);
      return { cat, passed: inCat.filter((r) => r.pass).length, total: inCat.length };
    });
  }, [results]);
  const passed = results.filter((r) => r.pass).length;
  const resultJson =
    results.length > 0
      ? JSON.stringify({ startedAt, commit, results }, null, 2)
      : "";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          disabled={running}
          aria-label="Eval cases to run"
          className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
        >
          <option value="__full__">Full set ({cases.length} cases)</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} [{c.category}]
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={running}
          className="rounded-full bg-gray-900 px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? `Running ${current}…` : "Run exam"}
        </button>
        {results.length > 0 && !running && (
          <CopyButton text={resultJson} label="eval results" />
        )}
      </div>
      <p className="text-sm text-gray-500">
        A full set spends ~30–40 AI calls over a few minutes on the fixture hotel only —
        never real bookings. Results stay on this page; copy them before leaving.
      </p>
      {runError && <p className="text-sm font-medium text-red-700">{runError}</p>}
      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.map((r) => (
            <div key={r.id} className="text-sm">
              <p className="flex items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.pass ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {r.pass ? "PASS" : "FAIL"}
                </span>
                <span className="font-mono text-gray-900">{r.id}</span>
                <span className="text-gray-500">[{r.category}]</span>
              </p>
              {r.failures.map((f, i) => (
                <p key={i} className="pl-14 text-gray-700">
                  – {f}
                </p>
              ))}
              {r.softWarnings.map((w, i) => (
                <p key={i} className="pl-14 text-gray-500">
                  – soft: {w}
                </p>
              ))}
            </div>
          ))}
          <p className="pt-1 text-sm font-semibold text-gray-900">
            {passed}/{results.length} passed
            {rates.length > 1 && ` · ${rates.map((r) => `${r.cat} ${r.passed}/${r.total}`).join(" · ")}`}
          </p>
        </div>
      )}
    </div>
  );
}
