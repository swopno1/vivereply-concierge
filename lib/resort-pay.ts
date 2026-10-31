// Resort payment pointer ("showing the cash counter"). Concierge NEVER
// takes resort money itself: the owner configures their own payment page
// URL on the Suite binding, and after a draft the bot deep-links there
// with ?booking=CODE. No minting, no status tracking, no Stripe on this
// path — payment happens entirely on the resort's website. Pure helpers
// (no database) so the tool layer and the settings API share them.

export function cleanPaymentPageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/$/, "");
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Production guardrail (same rule as binding URLs): payment pointers
  // are https-only outside development — a pay link must never be
  // plain http or loopback in production.
  if (process.env.NODE_ENV === "production") {
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return null;
    }
  }
  return trimmed;
}

// Deep-link shape: {page}?booking={code} (or &booking= when the page
// URL already carries a query string). The booking code rides visibly
// so the resort page can prefill it — no token, nothing to enumerate,
// because the page itself is the resort's own authenticated surface.
export function resortPaymentUrl(pageUrl: string, bookingCode: string): string {
  const sep = pageUrl.includes("?") ? "&" : "?";
  return `${pageUrl}${sep}booking=${encodeURIComponent(bookingCode)}`;
}
