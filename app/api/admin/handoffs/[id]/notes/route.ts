// Handoff-note admin API (session auth for the in-app /staff board).
//   POST /api/admin/handoffs/[id]/notes { propertyId, author, body } -> note
// Same validation as the bridge notes route: named author, 2000-char cap.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan, sessionOwnerVerified } from "@/lib/tenant";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!(await sessionOwnerVerified(session))) {
    return NextResponse.json({ error: "Verify your email to view handoffs." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  }
  const { id } = await params;
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
    where: { id, conversation: { propertyId } },
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
