// Shared app shell (sidebar + content) for every web-app page in this
// route group: /, /staff, /login, /settings, /onboarding. The
// widget (/widget) sits outside the group, so the narrow embed panel
// stays a bare chat. Server component: it reads the session cookie once
// and hands the session (who + role + property) to the client shell,
// which owns the mobile slide-over, role-filtered nav, and the
// sign-in/sign-out footer. The session shape is passed structurally — the
// client shell must never import server modules.

import { getSession } from "@/lib/tenant";
import AppShell from "../components/AppShell";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <AppShell
      session={
        session
          ? { email: session.email, role: session.role, propertyId: session.propertyId }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
