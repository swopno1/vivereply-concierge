// Bridge API: staff follow-up notes on a handoff (server-to-server).
//   POST /api/bridge/handoffs/[id]/notes { author, body } -> the note (201)
// Notes are the bridge's "create": the chat agent never writes them, only
// client dashboards do, through this endpoint. Same 404 rule as the rest
// of the bridge: another property's id looks exactly like a missing one.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBridgeRequest } from "@/lib/bridge";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyBridgeRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing bridge credential." }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const author = typeof body?.author === "string" ? body.author.trim() : "";
  const noteBody = typeof body?.body === "string" ? body.body.trim() : "";
  if (!author || author.length > 100) {
    return NextResponse.json(
      { error: "Author is required (a staff name, max 100 characters)." },
      { status: 400 }
    );
  }
  if (!noteBody || noteBody.length > 2000) {
    return NextResponse.json(
      { error: "Body is required (max 2000 characters)." },
      { status: 400 }
    );
  }
  const handoff = await prisma.handoffRecord.findFirst({
    where: { id, conversation: { propertyId: auth.propertyId } },
  });
  if (!handoff) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  const note = await prisma.handoffNote.create({
    data: { handoffId: id, author, body: noteBody },
  });
  return NextResponse.json(
    {
      id: note.id,
      handoffId: id,
      author: note.author,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
