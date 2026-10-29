// Eval runner API (SUPER_ADMIN only). Runs eval cases against the FIXTURE
// property from the Settings UI — the same cases + checks as the terminal
// runner (eval/run.mjs imports below, single source of truth).
//   POST /api/admin/eval/run { caseId } -> { id, category, pass, failures, softWarnings, reply, cards }
// One case per request (the UI loops for a full set) so each call fits
// comfortably inside the function timeout. The chat token is minted
// server-side for the fixture property ONLY — evaluating any other
// property is structurally impossible here, so a UI run can never burn
// real Suite drafts. Harness errors return pass:false (HTTP 200), matching
// the terminal runner, so a full-set loop continues past them.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/tenant";
import { createChatToken } from "@/lib/auth";
import { CASES, EVAL_PROPERTY_ID } from "@/eval/cases.mjs";
import { parseSseDone, runCheck } from "@/eval/run.mjs";

export const dynamic = "force-dynamic";

type Capture = { card: string; field: string; as: string };
type Turn = { send: string; capture?: Capture[] };
type EvalCase = { id: string; category: string; turns: Turn[]; checks: unknown[] };
type DoneEvent = { reply: string; conversationId: string; cards?: Record<string, unknown>[] };

async function chatTurn(
  base: string,
  token: string,
  message: string,
  conversationId: string | null
): Promise<DoneEvent> {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, token, ...(conversationId ? { conversationId } : {}) }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return parseSseDone(await res.text()) as DoneEvent;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the Vivereply team can run the eval." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  const testCase = (CASES as EvalCase[]).find((c) => c.id === caseId);
  if (!testCase) {
    return NextResponse.json(
      { error: "Unknown case. Pick one from the Settings list." },
      { status: 400 }
    );
  }

  const token = createChatToken({ propertyId: EVAL_PROPERTY_ID as string, scope: "direct" });
  if (!token) {
    return NextResponse.json({ error: "Chat is not configured." }, { status: 500 });
  }
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "app.vivereply.com";
  const proto =
    req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;

  try {
    const captures: Record<string, string> = {};
    let conversationId: string | null = null;
    let reply = "";
    let cards: Record<string, unknown>[] = [];
    for (const turn of testCase.turns) {
      const send = turn.send.replace(/\{(\w+)\}/g, (_, name: string) => {
        if (captures[name] === undefined) throw new Error(`No capture named {${name}}.`);
        return captures[name];
      });
      const done = await chatTurn(base, token, send, conversationId);
      conversationId = done.conversationId;
      reply = done.reply;
      cards = done.cards ?? [];
      for (const cap of turn.capture ?? []) {
        const card = cards.find((c) => c.kind === cap.card);
        if (!card || card[cap.field] === undefined) {
          throw new Error(`Capture failed: no ${cap.card} card with ${cap.field}.`);
        }
        captures[cap.as] = String(card[cap.field]);
      }
    }
    const failures: string[] = [];
    const softWarnings: string[] = [];
    for (const check of testCase.checks) {
      const err = runCheck(
        check as Parameters<typeof runCheck>[0],
        reply,
        cards,
        captures
      ) as string | null;
      if (err) ((check as { soft?: boolean }).soft ? softWarnings : failures).push(err);
    }
    return NextResponse.json({
      id: testCase.id,
      category: testCase.category,
      pass: failures.length === 0,
      failures,
      softWarnings,
      reply: reply.slice(0, 500),
      cards,
    });
  } catch (e) {
    return NextResponse.json({
      id: testCase.id,
      category: testCase.category,
      pass: false,
      failures: [`harness: ${e instanceof Error ? e.message : e}`],
      softWarnings: [],
      reply: "",
      cards: [],
    });
  }
}
