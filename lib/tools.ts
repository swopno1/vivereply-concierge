// Agent tools (step 2a). The model may only act through these — it never
// sees Suite endpoints, credentials, or database rows. Every call is
// logged to tool_call_logs by the route, which is also how the guards
// below are enforced (quote-first, one draft per conversation).
//
// Tools are deliberately free of any Prisma import: the route injects a
// small ToolDb implementation, so this file typechecks anywhere.

import { DEMO_ROOMS, type DemoRoom } from "@/demo-config/rooms";
import { isDateString, nightsBetween, quoteForStay, formatTaka } from "@/demo-config/rates";
import type { SuiteAdapter } from "./suite";
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
  // Claim-then-book serialization (double-draft race guard): exactly
  // one holder per conversation; false means a sibling turn is inside
  // its booking window. Always paired with releaseDraftClaim.
  claimDraft(conversationId: string): Promise<boolean>;
  releaseDraftClaim(conversationId: string): Promise<void>;
  getDraft(conversationId: string): Promise<BookingDraftRecord | null>;
  createHandoff(conversationId: string, reason: string, summary: string): Promise<void>;
  createPaymentLink(
    conversationId: string,
    method: "stripe" | "manual"
  ): Promise<PaymentLinkResult>;
  getPaymentStatus(conversationId: string): Promise<PaymentStatusResult>;
};

// Server-minted payment data (booking payments). The model repeats the
// paymentUrl EXACTLY as returned — it must never invent, shorten, or
// rephrase a payment URL, and it never takes payment itself.
export type PaymentLinkResult = {
  paymentUrl: string;
  method: "stripe" | "manual";
  methodLabel: string;
  bookingCode: string;
  amount: string;
  expiresAt: string;
  reused: boolean;
};

export type PaymentStatusResult = {
  found: boolean;
  status: "pending" | "paid" | "expired" | "canceled";
  method: "stripe" | "manual" | null;
  methodLabel: string | null;
  bookingCode: string | null;
  amount: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  paymentUrl: string | null;
  // NOTE: no token field on purpose — the model gets the full payment
  // URL and must never see the raw token it could rephrase or leak.
};

const DATE_DESC = "Exact date in YYYY-MM-DD format.";

// Tool schemas built per request from the property's catalogue (adapter
// Phase 3): the model can only name rooms the property actually has.
// Payment tools join the list only when the route says this turn takes
// payments (flag on + Suite backend — never fixtures).
function buildToolDefinitions(roomSlugs: string[], opts?: { payments?: boolean }): ToolDefinition[] {
  const defs: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "How many units of a room are free for a stay. Call before quoting.",
      parameters: {
        type: "object",
        properties: {
          roomSlug: { type: "string", enum: roomSlugs, description: "Room slug from the catalogue." },
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
          roomSlug: { type: "string", enum: roomSlugs, description: "Room slug from the catalogue." },
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
          roomSlug: { type: "string", enum: roomSlugs, description: "Room slug from the catalogue." },
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
  if (opts?.payments) {
    defs.push(
      {
        type: "function",
        function: {
          name: "create_payment_link",
          description:
            "Mint the guest's payment link for the draft held in this conversation. Call ONLY after the guest agreed to pay AND picked a method. Returns the payment URL — repeat it EXACTLY as returned, never invent, shorten, or rephrase it. You never take payment yourself.",
          parameters: {
            type: "object",
            properties: {
              method: {
                type: "string",
                enum: ["stripe", "manual"],
                description: "\"stripe\" for card payment, \"manual\" for bKash/bank transfer verified by staff.",
              },
            },
            required: ["method"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "check_payment_status",
          description:
            "Check whether the booking held in this conversation is paid. Use when the guest asks about payment. Reports the paid time and amount, or pending + expiry + the payment URL again.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      }
    );
  }
  return defs;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = buildToolDefinitions(
  DEMO_ROOMS.map((r) => r.slug)
);

export function toolDefinitionsFor(rooms: DemoRoom[], opts?: { payments?: boolean }): ToolDefinition[] {
  return buildToolDefinitions(
    rooms.map((r) => r.slug),
    opts
  );
}

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

function resolveRoom(args: StayArgs, rooms: DemoRoom[]): DemoRoom | Record<string, unknown> {
  const room = typeof args.roomSlug === "string" ? rooms.find((r) => r.slug === args.roomSlug) : undefined;
  if (!room) return err("That room is not in the catalogue. Offer a listed room instead.");
  if (!room.suiteRoomId) {
    return err(
      `The ${room.name} is not connected to live availability yet. Tell the guest staff will confirm it and offer a handoff.`
    );
  }
  return room;
}

export function createToolExecutor(
  conversationId: string,
  db: ToolDb,
  suite: SuiteAdapter,
  catalogue: DemoRoom[],
  opts?: { payments?: boolean }
) {
  const paymentsOn = opts?.payments === true;
  return async function execute(name: string, argsJson: string): Promise<unknown> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      return err("Invalid tool arguments.");
    }

    // Booking payments (suite users only, flag-gated). The gate is
    // enforced here too — not just by hiding the definitions — so a
    // smuggled tool call fails closed with a guest-safe message.
    if (name === "create_payment_link") {
      if (!paymentsOn) return err("Payments are not enabled for this resort. Offer a handoff to staff instead.");
      const method = args.method === "stripe" || args.method === "manual" ? args.method : null;
      if (!method) return err("Pick a payment method first: card or manual transfer. Ask the guest which they prefer.");
      if (!(await db.hasDraft(conversationId))) {
        return err("There is no booking draft in this conversation yet. Confirm a quote and the guest's details first.");
      }
      try {
        const link = await db.createPaymentLink(conversationId, method);
        return {
          ...link,
          message:
            "Give the guest this payment URL EXACTLY as shown (it opens in a new tab) with the amount and the expiry. Remind them: pay only through this link, on this domain — you never take card details or codes in chat, and staff never ask for them either.",
        };
      } catch (e) {
        return err(e instanceof Error ? e.message : "The payment link could not be created.");
      }
    }

    if (name === "check_payment_status") {
      if (!paymentsOn) return err("Payments are not enabled for this resort. Offer a handoff to staff instead.");
      try {
        const st = await db.getPaymentStatus(conversationId);
        if (!st.found) {
          return { ...st, message: "No payment link exists in this conversation yet. If the guest wants to pay, walk them through picking a method first." };
        }
        if (st.status === "paid") {
          return { ...st, message: "Confirm the payment to the guest with the amount and time. Their room is secured." };
        }
        if (st.status === "pending") {
          return { ...st, message: "The booking is still unpaid. Insist once more: share the payment URL EXACTLY as shown and the expiry — after that the hold releases." };
        }
        return { ...st, message: "This payment link is no longer usable. Offer to mint a fresh one if the draft hold is still alive." };
      } catch (e) {
        return err(e instanceof Error ? e.message : "The payment status could not be checked.");
      }
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
        const found = await suite.lookupBookingByCode(code);
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
        await suite.requestBookingDetails({ ...(email ? { email } : {}), ...(phone ? { phone } : {}) });
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

    const roomOrError = resolveRoom(stay, catalogue);
    if ("error" in (roomOrError as Record<string, unknown>)) return roomOrError;
    const room = roomOrError as DemoRoom;

    if (name === "check_availability") {
      try {
        const availability = await suite.getAvailability(room.suiteRoomId, checkIn, checkOut);
        return { room: room.name, checkIn, checkOut, available: availability.available };
      } catch (e) {
        return err(e instanceof Error ? e.message : "Availability check failed.");
      }
    }

    if (name === "get_quote") {
      try {
        const availability = await suite.getAvailability(room.suiteRoomId, checkIn, checkOut);
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
      // Claim-then-book: the hasDraft check above still races when two
      // turns overlap, so the database serializes the booking window
      // (unique claim per conversation). Denied means a sibling turn is
      // inside its window — re-read hasDraft to tell "already held"
      // from "in progress". The claim ALWAYS releases (finally):
      // post-success duplicates are impossible by idempotency key
      // (conversationId — one draft per conversation, stable across
      // retries), so the claim must not outlive the window.
      if (!(await db.claimDraft(conversationId))) {
        if (await db.hasDraft(conversationId)) {
          return err("This conversation already holds a booking draft. Share its booking code instead of creating another.");
        }
        return err("A booking is already being created in this conversation. Please wait a moment and try again.");
      }
      try {
        const booking = await suite.createBooking(
          room.suiteRoomId,
          { guestName, guestEmail, guestPhone },
          checkIn,
          checkOut,
          { idempotencyKey: conversationId }
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
      } finally {
        await db.releaseDraftClaim(conversationId);
      }
    }

    return err(`Unknown tool: ${name}`);
  };
}
