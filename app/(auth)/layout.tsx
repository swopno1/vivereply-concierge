// Minimal auth layout (Phase 0): mark, Back to homepage, Docs, then
// the form. No AppShell sidebar on any auth page — login, signup,
// forgot/reset-password, and verify-email all render here, signed in
// or not. Styling mirrors the app auth pages (light, rounded-full
// inputs, black pill buttons), which the marketing AuthShell mirrors
// back — the marketing→app switch stays visually seamless.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center bg-white p-4 font-sans text-gray-900 antialiased">
      <nav aria-label="Auth" className="mb-4 flex items-center justify-between text-sm">
        <a href="https://vivereply.com" className="font-medium text-gray-900 underline">
          ← Back to homepage
        </a>
        <a
          href="https://vivereply.com/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-gray-900 underline"
        >
          Docs
        </a>
      </nav>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0C1222]">
          <img src="/brand/vivereply-mark.svg" alt="Vivereply logo" className="h-9 w-9" />
        </span>
        <span className="text-lg font-bold">Vivereply Concierge</span>
      </div>
      {children}
      <p className="mt-6 text-center text-xs text-gray-500">
        Vivereply Concierge · ViveScript Solutions LLC
      </p>
    </main>
  );
}
