import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vivereply Concierge — Demo",
  description: "AI front-of-house for resorts. Chat, check availability, get exact quotes, and draft bookings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
