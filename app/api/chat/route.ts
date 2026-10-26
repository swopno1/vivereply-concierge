import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/meta";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }
  try {
    const reply = await chatCompletion([{ role: "user", content: message }]);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Meta API error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "The assistant is unavailable right now. Please try again." },
      { status: 502 }
    );
  }
}
