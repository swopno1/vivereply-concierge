// App shell: left nav sidebar + content area + mobile top bar (client).
// Rendered by app/(shell)/layout.tsx around every web-app page. The New
// chat button talks to the Chat component through a window event, because
// the layout sits above the page and cannot call its state directly —
// Chat ignores the event while a reply is in flight, so the button needs
// no busy state of its own. The footer shows Sign in (with a ?next= back
// to the current page) or the Admin row with Sign out.

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

export const NEW_CHAT_EVENT = "concierge:new-chat";

const NAV = [
  { href: "/", label: "Chat" },
  { href: "/staff", label: "Staff handoffs" },
  { href: "/admin", label: "Admin" },
];

export default function AppShell({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function newChat() {
    window.dispatchEvent(new CustomEvent(NEW_CHAT_EVENT));
    setOpen(false);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  return (
    <main className="flex h-screen w-full bg-white font-sans text-gray-900 antialiased">
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col gap-1 border-r border-gray-200 bg-gray-50 p-3 transition-transform md:static md:w-64 md:shrink-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-2 py-2">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0C1222]"
          >
            <img src="/brand/vivereply-mark.svg" alt="" className="h-7 w-7" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight">
              Vivereply Concierge
            </span>
            <span className="block truncate text-xs text-gray-500">AI front-of-house</span>
          </span>
        </div>
        {pathname === "/" && (
          <button
            onClick={newChat}
            title="Start a new conversation"
            className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-100"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New chat
          </button>
        )}
        <nav aria-label="Concierge" className="mt-3 flex flex-col gap-1">
          {NAV.map((item) =>
            pathname === item.href ? (
              <span
                key={item.href}
                aria-current="page"
                className="rounded-xl bg-gray-200/70 px-4 py-2.5 text-sm font-medium text-gray-900"
              >
                {item.label}
              </span>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className="rounded-xl px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-200/50"
              >
                {item.label}
              </a>
            )
          )}
        </nav>
        <div className="mt-auto px-1 py-1">
          {signedIn ? (
            <div className="flex items-center gap-2 rounded-xl bg-gray-200/50 px-3 py-2">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-white"
              >
                A
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">Admin</span>
              <button
                onClick={signOut}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900"
              >
                Sign out
              </button>
            </div>
          ) : (
            <a
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className="block rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-100"
            >
              Sign in
            </a>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white/90 px-3 py-2.5 backdrop-blur md:hidden">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle navigation"
            className="rounded-full p-2 text-gray-700 hover:bg-gray-100"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path
                d="M2 4.5h14M2 9h14M2 13.5h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="truncate text-[15px] font-semibold">Vivereply Concierge</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </main>
  );
}
