// Shared app shell (sidebar + content) for the shell route group: /,
// /staff, /settings, /setup, /onboarding, /billing. Auth pages (/login,
// /signup, /forgot-password, /reset-password, /verify-email) live in
// the (auth) group with a minimal layout instead — no sidebar there,
// signed in or not. The widget (/widget) sits outside both groups, so
// the narrow embed panel stays a bare chat. Server component: it reads
// the session cookie once and hands the session (who + role + property)
// to the client shell, which owns the mobile slide-over, role-filtered
// nav, and the sign-in/sign-out footer. The session shape is passed
// structurally — the client shell must never import server modules.
// Billing banner (Phase 3): owners also get one line of billing state
// (trial countdown from day 21, pause alerts, 80% usage, past-due)
// computed here server-side — two indexed reads, no client fetch.

import { getSession } from "@/lib/tenant";
import { USAGE_ALERT_RATIO, getBillingSnapshot } from "@/lib/billing";
import { getOwnTwoFaEnabled, listOwnerProperties } from "@/lib/dashboard";
import AppShell, { type BillingBanner } from "../components/AppShell";

async function billingBannerFor(propertyId: string): Promise<BillingBanner> {
  const snap = await getBillingSnapshot(propertyId, new Date()).catch(() => null);
  if (!snap || !snap.hasSubscription) return null;
  if (!snap.gate.allowed) {
    return snap.gate.reason === "quota-exceeded"
      ? { text: "Guest chat is paused — the monthly limit is reached.", tone: "bad" }
      : { text: "Guest chat is paused — subscribe to resume immediately.", tone: "bad" };
  }
  if (snap.status === "PAST_DUE") {
    return { text: "Latest payment failed — chat keeps running while we retry.", tone: "warn" };
  }
  if (snap.status === "TRIAL" && snap.trialDaysLeft <= 10) {
    return {
      text:
        snap.trialDaysLeft <= 1
          ? "Trial ends today — subscribe to keep guest chat running."
          : `Trial ends in ${snap.trialDaysLeft} days — subscribe to keep guest chat running.`,
      tone: "warn",
    };
  }
  if (snap.usageThisMonth >= Math.floor(snap.quotaThisMonth * USAGE_ALERT_RATIO)) {
    const pct = Math.round((snap.usageThisMonth / snap.quotaThisMonth) * 100);
    return { text: `${pct}% of monthly conversations used.`, tone: "warn" };
  }
  if (snap.status === "CANCELED" && snap.cancelAtPeriodEnd && snap.currentPeriodEnd) {
    const date = snap.currentPeriodEnd.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    return { text: `Subscription ends ${date} — resubscribe to avoid a pause.`, tone: "warn" };
  }
  return null;
}

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const banner =
    session && session.role === "OWNER" && session.propertyId
      ? await billingBannerFor(session.propertyId)
      : null;
  const properties =
    session?.role === "OWNER" && session.email
      ? await listOwnerProperties(session.email, session.propertyId)
      : [];
  const twoFaEnabled = await getOwnTwoFaEnabled(session);
  return (
    <AppShell
      session={
        session
          ? { email: session.email, role: session.role, propertyId: session.propertyId }
          : null
      }
      properties={properties}
      twoFaEnabled={twoFaEnabled}
      billingBanner={banner}
    >
      {children}
    </AppShell>
  );
}
