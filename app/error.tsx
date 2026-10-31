// Route error boundary: when a page (settings, staff, onboarding…)
// throws — e.g. the database is unreachable mid-render — Next.js
// shows this instead of the default 500 wall. Guest chat never hits
// it (the widget renders its own error panel + retry), but staff
// pages do, so the copy names the likely cause and offers a retry.
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-8">
      <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
      <p className="text-sm text-gray-600">
        This page could not load — usually a brief connection problem.
        Your data is safe; try again in a moment.
      </p>
      {process.env.NODE_ENV !== "production" && (
        <p className="font-mono text-xs text-gray-500">{error.message}</p>
      )}
      <div>
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-black px-4 py-2 text-sm text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
