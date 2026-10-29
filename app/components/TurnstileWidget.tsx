// Cloudflare Turnstile widget (spam defense, client side).
// Loads the Turnstile script once per page, renders into the div, and
// reports the response token via onVerify ("" when it expires).
// Tokens are SINGLE-USE: parents must remount (key={attempt}) after
// every submit, or the second submit replays a dead token. Renders
// nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset — the server
// then refuses signup closed and skips login checks with an alarm.

"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }
      ) => string;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const cbRef = useRef(onVerify);
  cbRef.current = onVerify;

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    let rendered = false;
    const render = () => {
      if (cancelled || rendered || !window.turnstile || !ref.current) return;
      rendered = true;
      window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => cbRef.current(token),
        "expired-callback": () => cbRef.current(""),
      });
    };
    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", render, { once: true });
        render();
      } else {
        const s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.onload = render;
        document.head.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} />;
}
