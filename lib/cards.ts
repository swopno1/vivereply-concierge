// Structured cards for the chat UI (step 2b). The model still answers in
// plain text; the cards are built from the tool-call logs of the same
// turn, so a card can never show a price, room, or booking code the
// tools did not actually return. Kept free of any Prisma import: the
// route passes plain log rows in, so this file typechecks anywhere.
//
// A card is only built from a successful tool output: get_quote output
// with a total, create_booking_draft output with a bookingCode, and
// request_handoff input (reason + summary — its output carries neither).

export type Card =
  | {
      kind: "quote";
      room: string;
      checkIn: string;
      checkOut: string;
      nights: number;
      total: string;
      available: number;
    }
  | {
      kind: "draft";
      room: string;
      checkIn: string;
      checkOut: string;
      bookingCode: string;
      suiteTotal: string;
      quotedTotal: string;
      totalsMatch: boolean;
    }
  | { kind: "handoff"; reason: string; summary: string };

export type CardLogRow = {
  toolName: string;
  input: unknown;
  output: unknown;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function buildCards(logs: CardLogRow[]): Card[] {
  const cards: Card[] = [];
  for (const log of logs) {
    const out = obj(log.output);
    const inp = obj(log.input);
    if (log.toolName === "get_quote" && out) {
      const room = str(out.room);
      const checkIn = str(out.checkIn);
      const checkOut = str(out.checkOut);
      const nights = num(out.nights);
      const total = str(out.total);
      const available = num(out.available);
      if (room && checkIn && checkOut && nights !== null && total && available !== null) {
        cards.push({ kind: "quote", room, checkIn, checkOut, nights, total, available });
      }
    } else if (log.toolName === "create_booking_draft" && out) {
      const bookingCode = str(out.bookingCode);
      const room = str(out.room);
      const checkIn = str(out.checkIn);
      const checkOut = str(out.checkOut);
      const suiteTotal = str(out.suiteTotal);
      const quotedTotal = str(out.quotedTotal);
      if (bookingCode && room && checkIn && checkOut && suiteTotal && quotedTotal) {
        cards.push({
          kind: "draft",
          room,
          checkIn,
          checkOut,
          bookingCode,
          suiteTotal,
          quotedTotal,
          totalsMatch: out.totalsMatch === true,
        });
      }
    } else if (log.toolName === "request_handoff" && inp) {
      const reason = str(inp.reason);
      const summary = str(inp.summary);
      if (reason && summary) {
        cards.push({ kind: "handoff", reason, summary });
      }
    }
  }
  return cards;
}
