// Agent tools (step 2a). The model may only act through these — it never
// sees Suite endpoints, credentials, or database rows. Every call is
// logged to tool_call_logs by the route, which is also how the guards
// below are enforced (quote-first, one draft per conversation).
//
// Tools are deliberately free of any Prisma import: the route injects a
// small ToolDb implementation, so this file typechecks anywhere.

import { findRoomBySlug, DEMO_ROOMS } from "@/demo-config/rooms";
import { isDateString, nightsBetween, quoteForStay, formatTaka } from "@/demo-config/rates";
import { getAvailability, createBooking, lookupBookingByCode, requestBookingDetails } from "./suite";
import type { ToolDefinition } from "./meta";

export type BookingDraftRecord = {
  bookingCode: string;
  room: string;
  checkIn: string;
  checkOut: string;
  suiteTotal: string;
  quotedTotal: string;
  totalsMatch: boolean;
};

export type ToolDb = {
  hasQuote(
    conversationId: string,
    roomSlug: string,
    checkIn: string,
    checkOut: string
  ): Promise<boolean>;
  hasDraft(conversationId: string): Promise<boolean>;
  getDraft(conversationId: string): Promise<BookingDraftRecord | null>;
  createHandoff(conversationId: string, reason: string, summary: string): Promise<void>;
};

const ROOM_ENUM = DEMO_ROOMS.map((r) => r.slug);
const DATE_DESC = "Exact date in YYYY-MM-DD format.";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "How many units of a room are free for a stay. Call before quoting.",
      parameters: {
        type: "object",
        properties: {
          roomSlug: { type: "string", enum: ROOM_ENUM, description: "Room slug from the catalogue." },
          checkIn: { type: "string", description: DATE_DESC },
          checkOut: { type: "string", description: DATE_DESC },
        },
        required: ["roomSlug", "checkIn", "checkOut"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_quote",
      description: "Price quote for a room and stay, from catalogue prices and rate rules. Requires availability first (done inside).",
      parameters: {
        type: "object",
        properties: {
          roomSlug: { type: "string", enum: ROOM_ENUM, description: "Room slug from the catalogue." },
          checkIn: { type: "string", description: DATE_DESC },
          checkOut: { type: "string", description: DATE_DESC },
        },
        required: ["roomSlug", "checkIn", "checkOut"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_booking_draft",
      description: "Hold a room for the guest (PENDING booking, no payment). Only after the guest confirmed the quote and gave name, email, and phone.",
      parameters: {
        type: "object",
        properties: {
          roomSlug: { type: "string", enum: ROOM_ENUM, description: "Room slug from the catalogue." },
          checkIn: { type: "string", description: DATE_DESC },
          checkOut: { type: "string", description: DATE_DESC },
          guestName: { type: "string", description: "Guest full name." },
          guestEmail: { type: "string", description: "Guest email address." },
          guestPhone: { type: "string", description: "Guest phone number." },
        },
        required: ["roomSlug", "checkIn", "checkOut", "guestName", "guestEmail", "guestPhone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verify_booking",
      description: "Re-verify the booking draft held in this conversation, from its confirmed record. Use when the guest asks whether their booking is confirmed, or when anything about the booking is in doubt. Never use availability to verify a booking.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_booking_by_code",
      description: "Look up a booking by its code. Returns only the stay dates, the guest's first name, and the status — never anything else. Use when the guest has a booking code.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "The booking code, e.g. RES-202610-00001." },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_booking_details",
      description: "Send a guest's booking details to the email address already on their booking, looked up by email or phone. Details are never shown in chat. The reply is the same whether or not a booking exists — never say whether one was found.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Guest email address, if given." },
          phone: { type: "string", description: "Guest phone number, if given." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_handoff",
      description: "Hand the conversation to staff with a summary, when the request is outside what the tools can do or the guest asks for a person.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why a human is needed." },
          summary: { type: "string", description: "Full summary of the conversation and what the guest wants." },
        },
        required: ["reason", "summary"],
      },
    },
  },
];

function err(message: string): Record<string, unknown> {
  return { error: message };
}

function validStay(checkIn: unknown, checkOut: unknown): string | null {
  if (!isDateString(checkIn) || !isDateString(checkOut)) {
    return "Dates must be exact YYYY-MM-DD dates. Ask the guest for exact dates.";
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return "Check-out must be after check-in.";
  if (nights > 60) return "Stays longer than 60 nights cannot be booked here.";
  return null;
}

type StayArgs = {
  roomSlug?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
};

function resolveRoom(args: StayArgs): ReturnType<typeof findRoomBySlug> | Record<string, unknown> {
  const room = typeof args.roomSlug === "string" ? findRoomBySlug(args.roomSlug) : undefined;
  if (!room) return err("That room is not in the catalogue. Offer a listed room instead.");
  if (!room.suiteRoomId) {
    return err(
      `The ${room.name} is not connected to live availability yet. Tell the guest staff will confirm it and offer a handoff.`
    );
  }
  return room;
}

export function createToolExecutor(conversationId: string, db: ToolDb) {
  return async function execute(name: string, argsJson: string): Promise<unknown> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      return err("Invalid tool arguments.");
    }

    if (name === "request_handoff") {
      const reason = typeof args.reason === "string" ? args.reason : "";
      const summary = typeof args.summary === "string" ? args.summary : "";
      if (!reason || !summary) return err("A handoff needs a reason and a summary.");
      await db.createHandoff(conversationId, reason, summary);
      return { handedOff: true, message: "The conversation has been passed to staff with the full summary." };
    }

    if (name === "verify_booking") {
      const draft = await db.getDraft(conversationId);
      if (!draft) {
        return err("No booking draft is held in this conversation yet. A draft exists only after the guest confirms a quote and shares their details.");
      }
      return {
        verified: true,
        bookingCode: draft.bookingCode,
        room: draft.room,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        suiteTotal: draft.suiteTotal,
        quotedTotal: draft.quotedTotal,
        totalsMatch: draft.totalsMatch,
        message: "This booking is confirmed as held (status PENDING, no payment taken). Read these details back to the guest exactly as shown.",
      };
    }

    if (name === "lookup_booking_by_code") {
      const code = typeof args.code === "string" ? args.code.trim() : "";
      if (!code) return err("A booking code is needed to look a booking up. Ask the guest for their code.");
      try {
        const found = await lookupBookingByCode(code);
        return {
          bookingCode: found.bookingCode,
          firstName: found.firstName,
          checkIn: found.checkIn,
          checkOut: found.checkOut,
          status: found.status,
          message: "Read back only these details: the stay dates, the guest's first name, and the status. Do not add anything the lookup did not return.",
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (message === "not_found") return err("No booking found for that code. Ask the guest to check the code and try again.");
        if (message === "rate_limited") return err("Too many lookup attempts. Ask the guest to try again later.");
        return err(message || "Booking lookup failed.");
      }
    }

    if (name === "request_booking_details") {
      const email = typeof args.email === "string" ? args.email.trim() : "";
      const phone = typeof args.phone === "string" ? args.phone.trim() : "";
      if (!email && !phone) return err("An email address or phone number is needed. Ask the guest for one.");
      try {
        await requestBookingDetails({ ...(email ? { email } : {}), ...(phone ? { phone } : {}) });
        return {
          sent: true,
          message: "If a booking exists for that contact, its details have been sent to the email address on the booking. For privacy, booking details are never shown in chat. Give the guest exactly this confirmation, and never say whether a booking was found.",
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (message === "rate_limited") return err("Too many attempts. Ask the guest to try again later.");
        return err(message || "Could not request booking details.");
      }
    }

    const stay = args as StayArgs;
    const stayError = validStay(stay.checkIn, stay.checkOut);
    if (stayError) return err(stayError);
    const checkIn = stay.checkIn as string;
    const checkOut = stay.checkOut as string;

    const roomOrError = resolveRoom(stay);
    if ("error" in (roomOrError as Record<string, unknown>)) return roomOrError;
    const room = roomOrError as NonNullable<ReturnType<typeof findRoomBySlug>>;

    if (name === "check_availability") {
      try {
        const availability = await getAvailability(room.suiteRoomId, checkIn, checkOut);
        return { room: room.name, checkIn, checkOut, available: availability.available };
      } catch (e) {
        return err(e instanceof Error ? e.message : "Availability check failed.");
      }
    }

    if (name === "get_quote") {
      try {
        const availability = await getAvailability(room.suiteRoomId, checkIn, checkOut);
        if (availability.available <= 0) {
          return err(`The ${room.name} is sold out for ${checkIn} to ${checkOut}. Offer another room or dates.`);
        }
        const quote = quoteForStay(room.basePricePoisha, checkIn, checkOut);
        return {
          room: room.name,
          checkIn,
          checkOut,
          nights: quote.nights,
          nightly: quote.nightly.map((n) => ({
            date: n.date,
            price: formatTaka(n.pricePoisha),
            adjustments: n.applied,
          })),
          totalPoisha: quote.totalPoisha,
          total: formatTaka(quote.totalPoisha),
          available: availability.available,
        };
      } catch (e) {
        return err(e instanceof Error ? e.message : "Quote failed.");
      }
    }

    if (name === "create_booking_draft") {
      const guestName = typeof args.guestName === "string" ? args.guestName.trim() : "";
      const guestEmail = typeof args.guestEmail === "string" ? args.guestEmail.trim() : "";
      const guestPhone = typeof args.guestPhone === "string" ? args.guestPhone.trim() : "";
      if (!guestName || !guestEmail.includes("@") || !guestPhone) {
        return err("A draft needs the guest's name, a valid email, and a phone number. Ask for any missing detail.");
      }
      if (!(await db.hasQuote(conversationId, room.slug, checkIn, checkOut))) {
        return err("Show the guest a quote for this room and these dates first, and get their confirmation, before drafting.");
      }
      if (await db.hasDraft(conversationId)) {
        return err("This conversation already holds a booking draft. Share its booking code instead of creating another.");
      }
      try {
        const booking = await createBooking(
          room.suiteRoomId,
          { guestName, guestEmail, guestPhone },
          checkIn,
          checkOut
        );
        const quoted = quoteForStay(room.basePricePoisha, checkIn, checkOut);
        const totalsMatch = booking.totalAmountPoisha === quoted.totalPoisha;
        return {
          bookingCode: booking.bookingCode,
          room: room.name,
          checkIn,
          checkOut,
          suiteTotal: formatTaka(booking.totalAmountPoisha),
          suiteTotalPoisha: booking.totalAmountPoisha,
          quotedTotal: formatTaka(quoted.totalPoisha),
          quotedTotalPoisha: quoted.totalPoisha,
          totalsMatch,
          note: totalsMatch
            ? "The Suite total matches the quote."
            : "The Suite total governs: it differs from the quote, so tell the guest the Suite total.",
        };
      } catch (e) {
        return err(e instanceof Error ? e.message : "Booking draft failed.");
      }
    }

    return err(`Unknown tool: ${name}`);
  };
}
