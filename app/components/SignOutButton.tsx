// Sign-out button for the settings profile section (client: posts to
// the logout API, then lands on the chat page with a fresh shell).

"use client";

export default function SignOutButton() {
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  return (
    <button
      onClick={signOut}
      className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white"
    >
      Sign out
    </button>
  );
}
