// Staff handoff view (inside the shell route group: nav lives in the
// sidebar, so this page keeps only its own content). Lists the handoffs
// the agent made for ONE property, with the full conversation transcript,
// so staff can pick up where the bot left off. Owners see only their own
// property; the super-admin may pass ?property=<id>. No session means a
// redirect to /login, before any handoff is read.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, resolvePropertyId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/staff");
  }
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);

  const handoffs = await prisma.handoffRecord.findMany({
    where: { conversation: { propertyId } },
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
    <div className="mx-auto w-full max-w-2xl p-4">
      <header className="border-b pb-3">
        <h1 className="text-xl font-bold">Staff — Handoffs</h1>
        <p className="text-sm text-gray-500">
          Conversations the Concierge passed to staff for {propertyId}, newest first.
        </p>
      </header>

      <div className="flex flex-col gap-6 py-4">
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
        Signed-in owners see only their own property&apos;s handoffs.
      </p>
    </div>
  );
}
