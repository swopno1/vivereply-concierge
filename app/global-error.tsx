// Root error boundary: only fires when the root layout itself fails.
// Must render its own <html>/<body> (the layout is gone). Same honest
// copy as the route boundary, no app chrome.
"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: 32, fontFamily: "system-ui" }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#555" }}>
            This page could not load — usually a brief connection problem.
            Your data is safe; try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ background: "#000", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 14 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
