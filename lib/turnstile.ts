// Cloudflare Turnstile verification (spam defense for public surfaces).
// verifyTurnstileToken asks Cloudflare whether a response token is
// human. An unset TURNSTILE_SECRET_KEY fails CLOSED (a missing key
// must never silently disable the human check) — callers that must
// stay available anyway (login) check turnstileConfigured() first,
// skip explicitly, and alarm via console.error so the gap is loud.

export function turnstileConfigured(): boolean {
  return (process.env.TURNSTILE_SECRET_KEY ?? "") !== "";
}

export async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY ?? "";
  if (!secret || !token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  }).catch(() => null);
  if (!res || !res.ok) return false;
  const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
  return data?.success === true;
}
