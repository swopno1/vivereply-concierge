// Logout button for protected pages (step 4.5). Client-side only
// because it posts to the logout API and then navigates.

"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <button onClick={logout} className="rounded-full border px-4 py-1 text-sm">
      Log out
    </button>
  );
}
