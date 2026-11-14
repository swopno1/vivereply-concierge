// Chatbot section sub-navigation (D1). Mirrors the sidebar's Chatbot
// entries so touch users can move between the six pages in place.

"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/chatbot", label: "Overview" },
  { href: "/chatbot/widget", label: "Widget & keys" },
  { href: "/chatbot/booking", label: "Booking system" },
  { href: "/chatbot/knowledge", label: "Knowledge" },
  { href: "/chatbot/handoffs", label: "Handoffs" },
  { href: "/chatbot/usage", label: "Usage" },
];

export default function ChatbotSubnav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Chatbot sections"
      className="sticky top-0 z-10 -mx-4 overflow-x-auto whitespace-nowrap border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur"
    >
      {LINKS.map((l) =>
        pathname === l.href ? (
          <span
            key={l.href}
            aria-current="page"
            className="mr-4 text-sm font-semibold text-gray-900"
          >
            {l.label}
          </span>
        ) : (
          <a
            key={l.href}
            href={l.href}
            className="mr-4 text-sm text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            {l.label}
          </a>
        )
      )}
    </nav>
  );
}
