import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.vivereply.com"),
  title: "Vivereply Concierge — Demo",
  description: "AI front-of-house for resorts. Chat, check availability, get exact quotes, and draft bookings.",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Vivereply Concierge",
    description: "AI front-of-house for resorts — answers, quotes, holds, and hands off from live data.",
    images: [{ url: "/og-concierge.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vivereply Concierge",
    description: "AI front-of-house for resorts — answers, quotes, holds, and hands off from live data.",
    images: ["/og-concierge.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
