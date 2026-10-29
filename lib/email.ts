// Transactional email via the Resend HTTPS API (no SDK).
// Only verification mail exists today. Sending needs RESEND_API_KEY;
// the sender identity is RESEND_FROM, which must be an address on a
// VERIFIED domain in production — Resend's onboarding sender only
// reaches the account's own inbox, so verification is unusable for
// real users until the domain is verified (founder task, DNS).
// Failures throw a short message; callers decide whether a failed
// send fails the request (signup: no — the owner can resend).

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";
  if (!apiKey || !from) throw new Error("Email is not configured.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your Vivereply Concierge email",
      html: `<p>Thanks for registering your resort with Vivereply Concierge.</p><p><a href="${link}">Verify this email address</a> to unlock your resort's configuration. The link expires in 24 hours and works once.</p><p>If you did not register, ignore this email.</p>`,
      text: `Thanks for registering your resort with Vivereply Concierge.\n\nVerify this email address to unlock your resort's configuration (expires in 24 hours, single use):\n${link}\n\nIf you did not register, ignore this email.`,
    }),
  }).catch(() => null);
  if (!res || !res.ok) throw new Error("The verification email could not be sent.");
}
