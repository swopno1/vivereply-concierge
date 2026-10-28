// Shared app shell (sidebar + content) for every web-app page in this
// route group: /, /staff, /admin, /login. The widget (/widget) sits
// outside the group, so the narrow embed panel stays a bare chat.
// Server component: it reads the admin session cookie once and hands the
// result to the client shell, which owns the mobile slide-over, nav
// highlighting, and the sign-in/sign-out footer.

import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import AppShell from "../components/AppShell";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const signedIn = verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
  return <AppShell signedIn={signedIn}>{children}</AppShell>;
}
