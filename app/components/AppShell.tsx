// App shell: tenant dashboard sidebar + content area + mobile top bar
// (client). Rendered by app/(shell)/layout.tsx around every shell page
// (auth pages use the minimal (auth) layout instead). The New chat
// button talks to the Chat component through a window event, because the
// layout sits above the page and cannot call its state directly — Chat
// ignores the event while a reply is in flight, so the button needs no
// busy state of its own. The footer shows Sign in (with a ?next= back to
// the current page) or the account block (email, 2FA status, sign out),
// plus a Docs link (above both states, so docs stay one click away).

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import PropertySwitcher from "./PropertySwitcher";
import type { OwnerProperty } from "@/lib/dashboard";

export const NEW_CHAT_EVENT = "concierge:new-chat";

export const DOCS_URL = "https://www.vivereply.com/docs";

// D1 nav, in order. Chatbot is a section with sub-pages; everything else
// is a single entry. /staff, /setup and /onboarding stay reachable by URL
// and deep links but are no longer sidebar entries.
const NAV: { href: string; label: string; section?: { href: string; label: string }[] }[] = [
  { href: "/", label: "Home" },
  { href: "/assistant", label: "Assistant" },
  {
    href: "/chatbot",
    label: "Chatbot",
    section: [
      { href: "/chatbot", label: "Overview" },
      { href: "/chatbot/widget", label: "Widget & keys" },
      { href: "/chatbot/booking", label: "Booking system" },
      { href: "/chatbot/knowledge", label: "Knowledge" },
      { href: "/chatbot/handoffs", label: "Handoffs" },
      { href: "/chatbot/usage", label: "Usage" },
    ],
  },
  { href: "/services", label: "My Services" },
  { href: "/billing", label: "Orders & Billing" },
  { href: "/support", label: "Support" },
  { href: "/settings", label: "Settings" },
];

export type ShellSession = {
  email: string | null;
  role: "SUPER_ADMIN" | "OWNER";
  propertyId: string | null;
} | null;

export type BillingBanner = { text: string; tone: "warn" | "bad" } | null;

export default function AppShell({
  session,
  properties,
  twoFaEnabled,
  billingBanner,
  children,
}: {
  session: ShellSession;
  properties: OwnerProperty[];
  twoFaEnabled: boolean;
  billingBanner?: BillingBanner;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const pathname = usePathname();
  const currentProperty = session?.propertyId
    ? (properties.find((p) => p.id === session.propertyId) ?? properties[0] ?? null)
    : (properties[0] ?? null);
  const whoLabel = !session ? "" : session.role === "SUPER_ADMIN" ? "Super admin" : (session.email ?? "Owner");
  const whoInitial = !session ? "" : (whoLabel.charAt(0).toUpperCase() || "A");

  function newChat() {
    window.dispatchEvent(new CustomEvent(NEW_CHAT_EVENT));
    setOpen(false);
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
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
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col gap-1 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3 transition-transform md:static md:w-64 md:shrink-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {session?.role === "OWNER" && (
          <PropertySwitcher properties={properties} currentId={session.propertyId} />
        )}
        {session?.role === "SUPER_ADMIN" && (
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Super admin · all properties
          </p>
        )}
        {pathname === "/assistant" && (
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
            item.section ? (
              <div key={item.href} className="flex flex-col gap-1">
                <button
                  onClick={() => setChatbotOpen((o) => !o)}
                  aria-expanded={chatbotOpen}
                  className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium ${
                    isActive(item.href) ? "bg-gray-200/70 text-gray-900" : "text-gray-700 hover:bg-gray-200/50"
                  }`}
                >
                  {item.label}
                  <span aria-hidden className="text-gray-500">
                    {chatbotOpen ? "▾" : "▸"}
                  </span>
                </button>
                {chatbotOpen &&
                  item.section.map((sub) =>
                    pathname === sub.href ? (
                      <span
                        key={sub.href}
                        aria-current="page"
                        className="rounded-xl bg-gray-200/70 px-4 py-2 pl-8 text-sm font-medium text-gray-900"
                      >
                        {sub.label}
                      </span>
                    ) : (
                      <a
                        key={sub.href}
                        href={sub.href}
                        className="rounded-xl px-4 py-2 pl-8 text-sm text-gray-700 hover:bg-gray-200/50"
                      >
                        {sub.label}
                      </a>
                    )
                  )}
              </div>
            ) : pathname === item.href ? (
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
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-200/50 hover:text-gray-900"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3 2.5h7.5L13.5 5.5v8H3v-11Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M10.5 2.5v3h3M5.5 8h5M5.5 10.5h5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            Docs
          </a>
          {session ? (
            <div className="flex flex-col gap-1 rounded-xl bg-gray-200/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-white"
                >
                  {whoInitial}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{whoLabel}</span>
                <button
                  onClick={signOut}
                  disabled={signingOut}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
              <a href="/settings#security" className="pl-9 text-xs text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">
                Two-factor: {twoFaEnabled ? "on" : "off"}
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <a
                href={`/login?next=${encodeURIComponent(pathname)}`}
                className="block rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-100"
              >
                Sign in
              </a>
              <a
                href="/signup"
                className="block rounded-xl bg-black px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-800"
              >
                Register your resort
              </a>
            </div>
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
          <span className="truncate text-[15px] font-semibold">
            {session?.role === "OWNER" ? (currentProperty?.name ?? "Vivereply Concierge") : "Vivereply Concierge"}
          </span>
        </div>
        {billingBanner && pathname !== "/billing" && pathname !== "/" && (
          <a
            href="/billing"
            className={`block px-4 py-2 text-center text-sm font-medium ${
              billingBanner.tone === "bad"
                ? "bg-red-600 text-white"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {billingBanner.text} →
          </a>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </main>
  );
}
