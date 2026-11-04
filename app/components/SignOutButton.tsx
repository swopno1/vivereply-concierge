// Sign-out button for the settings profile section (client: posts to
// the logout API, then lands on the chat page with a fresh shell).

"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  return (
    <button
      onClick={signOut}
      disabled={signingOut}
      className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
