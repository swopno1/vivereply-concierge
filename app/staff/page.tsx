// Staff handoff view (step 2b). Lists every handoff the agent made, with
// the full conversation transcript, so staff can pick up where the bot
// left off. Demo only in v1: no login protects this page — do not expose
// it beyond the demo until staff auth exists.

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const handoffs = await prisma.handoffRecord.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col p-4">
      <header className="border-b pb-3">
        <h1 className="text-xl font-bold">Staff — Handoffs</h1>
        <p className="text-sm text-gray-500">
          Conversations the Concierge passed to staff, newest first.
        </p>
        <p className="text-sm">
          <a href="/" className="underline">
            Back to chat
          </a>
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-6 py-4">
        {handoffs.length === 0 && (
          <p className="text-sm text-gray-500">
            No handoffs yet. Ask for a person, or make a request the tools cannot handle, and it
            will appear here.
          </p>
        )}
        {handoffs.map((h) => (
          <section key={h.id} className="rounded-xl border border-gray-300 px-4 py-3">
            <p className="font-semibold">{h.reason}</p>
            <p className="text-sm text-gray-700">{h.summary}</p>
            <p className="text-sm text-gray-500">
              Status: {h.status} · {h.createdAt.toLocaleString()} · Conversation{" "}
              {h.conversationId.slice(0, 8)}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {h.conversation.messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    m.role === "user" ? "self-end bg-black text-white" : "self-start bg-gray-100 text-gray-900"
                  }`}
                >
                  {m.content}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="border-t pt-3 text-sm text-gray-500">
        Demo only — this page has no login in v1.
      </p>
    </main>
  );
}
