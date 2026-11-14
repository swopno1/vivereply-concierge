// Support (D1): static, honest contact page. Docs, the Assistant,
// WhatsApp and email. No ticket system in D1.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/tenant";
import { DOCS_URL } from "../../components/AppShell";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/support");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Support</h1>
        <p className="text-sm text-gray-600">Guides, the Assistant, and a human when you need one.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:bg-gray-50"
        >
          <p className="text-sm font-semibold text-gray-900">Docs</p>
          <p className="text-sm text-gray-600">Setup guides and references for every product.</p>
        </a>
        <a href="/assistant" className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:bg-gray-50">
          <p className="text-sm font-semibold text-gray-900">Assistant</p>
          <p className="text-sm text-gray-600">Ask the Assistant — answers from the ViveReply guides.</p>
        </a>
        <a
          href="https://wa.me/8801819062270"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:bg-gray-50"
        >
          <p className="text-sm font-semibold text-gray-900">WhatsApp</p>
          <p className="text-sm text-gray-600">+8801819062270</p>
        </a>
        <a
          href="mailto:support@vivereply.com"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:bg-gray-50"
        >
          <p className="text-sm font-semibold text-gray-900">Email</p>
          <p className="text-sm text-gray-600">support@vivereply.com</p>
        </a>
      </div>
    </main>
  );
}
