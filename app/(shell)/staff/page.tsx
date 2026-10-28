// Staff handoff view (step 2b, protected since step 4.5). Lists every
// handoff the agent made, with the full conversation transcript, so
// staff can pick up where the bot left off. No valid admin session
// cookie means a redirect to /login, before any handoff is read.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login?next=/staff");
  }

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
        Protected by admin login since step 4.5.
      </p>
    </main>
  );
}
