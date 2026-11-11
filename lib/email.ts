// Transactional email via the Resend HTTPS API (no SDK).
// Verification + password-reset mail. Sending needs RESEND_API_KEY;
// the sender identity is RESEND_FROM, which must be an address on a
// VERIFIED domain in production — Resend's onboarding sender only
// reaches the account's own inbox, so auth mail is unusable for
// real users until the domain is verified (founder task, DNS).
// Failures throw a short message; callers decide whether a failed
// send fails the request (signup: no — the owner can resend;
// forgot-password: no — the response stays identical either way).

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

// Password-reset mail (public reset, Phase 0). Same Resend HTTPS shape
// as verification mail. The link carries the raw 32-byte token and
// expires in 1 hour (single use); the hash at rest is looked up by
// POST /api/auth/reset-password. Copy states the expiry honestly.
export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";
  if (!apiKey || !from) throw new Error("Email is not configured.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Vivereply Concierge password",
      html: `<p>Someone requested a password reset for this email's Vivereply Concierge account.</p><p><a href="${link}">Set a new password</a> — the link expires in 1 hour and works once.</p><p>If that was not you, ignore this email; your password stays as it is.</p>`,
      text: `Someone requested a password reset for this email's Vivereply Concierge account.\n\nSet a new password (expires in 1 hour, single use):\n${link}\n\nIf that was not you, ignore this email; your password stays as it is.`,
    }),
  }).catch(() => null);
  if (!res || !res.ok) throw new Error("The reset email could not be sent.");
}

// Guest payment receipt (booking payments). Sent once, right after the
// row flips to paid (webhook for cards, staff confirm for manual). Plain
// facts only, no links at all — so a forged "pay again" phish can't
// reuse this template's shape. Failures throw; callers log
// and continue (the paid row is the truth, the email is a courtesy).
export async function sendPaymentConfirmationEmail(args: {
  to: string;
  firstName: string;
  bookingCode: string;
  room: string;
  checkIn: string;
  checkOut: string;
  total: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";
  if (!apiKey || !from) throw new Error("Email is not configured.");
  const { to, firstName, bookingCode, room, checkIn, checkOut, total } = args;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Payment received — booking ${bookingCode}`,
      html: `<p>Hi ${firstName},</p><p>Your payment of ${total} for booking ${bookingCode} (${room}, ${checkIn} to ${checkOut}) is confirmed. Your room is secured — no further action needed.</p><p>If you did not make this payment, contact the resort immediately.</p>`,
      text: `Hi ${firstName},\n\nYour payment of ${total} for booking ${bookingCode} (${room}, ${checkIn} to ${checkOut}) is confirmed. Your room is secured — no further action needed.\n\nIf you did not make this payment, contact the resort immediately.`,
    }),
  }).catch(() => null);
  if (!res || !res.ok) throw new Error("The payment email could not be sent.");
}

// ---- subscription billing mail (Phase 3; owner-facing) ----
// Trial reminders, expiry, usage alerts, payment failures. Same
// Resend HTTPS shape. Copy carries NO dollar figures (prices stay
// unpublished until the founder says publish) — plan names, days,
// and counts only. The cron endpoint sends each notice once (see
// BillingNotice); failures throw and the notice stays unsent, so the
// next run retries rather than skipping.
async function sendBillingEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";
  if (!apiKey || !from) throw new Error("Email is not configured.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  }).catch(() => null);
  if (!res || !res.ok) throw new Error("The billing email could not be sent.");
}

function billingLink(): string {
  const base = (process.env.APP_BASE_URL ?? "https://app.vivereply.com").replace(/\/$/, "");
  return `${base}/billing`;
}

export async function sendTrialReminderEmail(args: {
  to: string;
  resortName: string;
  daysLeft: number;
}): Promise<void> {
  const { to, resortName, daysLeft } = args;
  const when = daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`;
  const subject = `Your Vivereply trial for ${resortName} ends ${when}`;
  const link = billingLink();
  await sendBillingEmail(
    to,
    subject,
    `<p>Hi,</p><p>Your 30-day free trial of Vivereply Concierge for ${resortName} ends ${when}. Subscribe on the <a href="${link}">billing page</a> to keep your AI front desk answering guests without a pause.</p><p>If the trial lapses, guest chat pauses until you subscribe — your settings and data stay put for 90 days.</p>`,
    `Hi,\n\nYour 30-day free trial of Vivereply Concierge for ${resortName} ends ${when}. Subscribe on the billing page to keep your AI front desk answering guests without a pause:\n${link}\n\nIf the trial lapses, guest chat pauses until you subscribe — your settings and data stay put for 90 days.`
  );
}

export async function sendTrialExpiredEmail(args: {
  to: string;
  resortName: string;
}): Promise<void> {
  const { to, resortName } = args;
  const link = billingLink();
  await sendBillingEmail(
    to,
    `Your Vivereply trial for ${resortName} has ended`,
    `<p>Hi,</p><p>Your 30-day free trial of Vivereply Concierge for ${resortName} has ended, so guest chat is paused for now. Nothing is deleted — subscribe on the <a href="${link}">billing page</a> and the assistant resumes immediately.</p><p>Your settings and data stay put for 90 days.</p>`,
    `Hi,\n\nYour 30-day free trial of Vivereply Concierge for ${resortName} has ended, so guest chat is paused for now. Nothing is deleted — subscribe on the billing page and the assistant resumes immediately:\n${link}\n\nYour settings and data stay put for 90 days.`
  );
}

export async function sendUsageAlertEmail(args: {
  to: string;
  resortName: string;
  used: number;
  quota: number;
}): Promise<void> {
  const { to, resortName, used, quota } = args;
  const link = billingLink();
  await sendBillingEmail(
    to,
    `${resortName} has used 80% of its monthly conversations`,
    `<p>Hi,</p><p>Your resort ${resortName} has handled ${used} of ${quota} conversations this month (80%). Past 120%, guest chat pauses until the next month unless you allow overage — see the <a href="${link}">billing page</a> for live usage.</p>`,
    `Hi,\n\nYour resort ${resortName} has handled ${used} of ${quota} conversations this month (80%). Past 120%, guest chat pauses until the next month unless you allow overage — see the billing page for live usage:\n${link}`
  );
}

export async function sendPaymentFailedEmail(args: {
  to: string;
  resortName: string;
}): Promise<void> {
  const { to, resortName } = args;
  const link = billingLink();
  await sendBillingEmail(
    to,
    `Action needed: payment failed for ${resortName}`,
    `<p>Hi,</p><p>The latest subscription payment for ${resortName} failed, so the account is past due. Guest chat keeps running while the payment is retried — please check the <a href="${link}">billing page</a> or reply to this email so we can sort out payment before access pauses.</p>`,
    `Hi,\n\nThe latest subscription payment for ${resortName} failed, so the account is past due. Guest chat keeps running while the payment is retried — please check the billing page or reply to this email so we can sort out payment before access pauses:\n${link}`
  );
}
