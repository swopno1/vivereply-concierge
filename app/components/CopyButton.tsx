// One-click copy for settings snippets (client: clipboard access).
// Falls back to a temporary textarea where the Clipboard API is blocked.

"use client";

import { useState } from "react";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }

  return (
    <button
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="shrink-0 rounded-full border border-gray-300 bg-white px-4 py-1 text-sm text-gray-700 hover:bg-gray-100"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
