// App shell: left nav sidebar + content area + mobile top bar (client).
// Rendered by app/(shell)/layout.tsx around every web-app page. The New
// chat button talks to the Chat component through a window event, because
// the layout sits above the page and cannot call its state directly —
// Chat ignores the event while a reply is in flight, so the button needs
// no busy state of its own. The footer shows Sign in (with a ?next= back
// to the current page) or the signed-in row with Sign out. /admin appears
// in the nav for SUPER_ADMIN only — owners never see a link they cannot
// open (the page itself enforces the same rule server-side).

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

export const NEW_CHAT_EVENT = "concierge:new-chat";

// Nav groups: Talk (the product), Manage (people + oversight), Configure
// (setup). /admin filters out for owners (see visibleGroups below); the
// page itself enforces the same rule server-side.
const NAV_GROUPS: { heading: string; items: { href: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    heading: "Talk",
    items: [
      {
        href: "/",
        label: "Chat",
        icon: (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2 3.5h12v7H8l-3.5 3v-3H2v-7Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
    ],
  },
  {
    heading: "Manage",
    items: [
      {
        href: "/staff",
        label: "Staff handoffs",
        icon: (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M5.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 1.5c-2 0-4 1-4 3v1.5h8V12.5c0-2-2-3-4-3Zm7.5-6.5h3m-1.5-1.5v3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ),
      },
      {
        href: "/admin",
        label: "Admin",
        icon: (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 1.5 13.5 4v4c0 3.5-2.5 5.5-5.5 6.5C5 13.5 2.5 11.5 2.5 8V4L8 1.5Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
    ],
  },
  {
    heading: "Configure",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2 3.4 12.6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ),
      },
      {
        href: "/onboarding",
        label: "Onboarding",
        icon: (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2.5 8a5.5 5.5 0 0 1 9.5-3.8M13.5 8a5.5 5.5 0 0 1-9.5 3.8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M12 1.8v3h-3M4 14.2v-3h3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
    ],
  },
];

export type ShellSession = {
  email: string | null;
  role: "SUPER_ADMIN" | "OWNER";
  propertyId: string | null;
} | null;

export default function AppShell({
  session,
  children,
}: {
  session: ShellSession;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isSuper = session?.role === "SUPER_ADMIN";
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: isSuper ? group.items : group.items.filter((item) => item.href !== "/admin"),
  })).filter((group) => group.items.length > 0);
  const whoLabel = !session ? "" : session.role === "SUPER_ADMIN" ? "Super admin" : (session.email ?? "Owner");
  const whoInitial = !session ? "" : (whoLabel.charAt(0).toUpperCase() || "A");

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
        <nav aria-label="Concierge" className="mt-3 flex flex-col gap-4 overflow-y-auto">
          {visibleGroups.map((group) => (
            <div key={group.heading} className="flex flex-col gap-1">
              <p className="px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {group.heading}
              </p>
              {group.items.map((item) =>
                pathname === item.href ? (
                  <span
                    key={item.href}
                    aria-current="page"
                    className="flex items-center gap-3 rounded-xl bg-gray-200/70 px-4 py-2.5 text-sm font-medium text-gray-900"
                  >
                    <span aria-hidden className="shrink-0 text-gray-700">{item.icon}</span>
                    {item.label}
                  </span>
                ) : (
                  <a
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-200/50"
                  >
                    <span aria-hidden className="shrink-0 text-gray-500">{item.icon}</span>
                    {item.label}
                  </a>
                )
              )}
            </div>
          ))}
        </nav>
        <div className="mt-auto px-1 py-1">
          {session ? (
            <div className="flex items-center gap-2 rounded-xl bg-gray-200/50 px-3 py-2">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-white"
              >
                {whoInitial}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{whoLabel}</span>
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
