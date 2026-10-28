// Suite HTTP adapter (spec: docs/suite-api-spec.md v1). The Concierge
// NEVER touches a Suite database — it talks to the Suite's HTTP endpoints
// only, and only from the server (never from the browser).
//
// Shape: SuiteAdapter (interface) + HttpSuiteAdapter (built per call from
// a binding: base URL + optional secret + version). The module-level
// functions below preserve the original zero-config path — same names,
// same behavior — by borrowing the default env binding. Phase 2 routes
// per-property bindings through the same class; tools.ts never sees the
// difference.
//
// Response guards: a backend answering outside the spec yields an honest
// "answered unexpectedly" error (the agent surfaces it and offers a
// handoff), never a crash on undefined fields and never an invented number.

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "./secrets";

export type SuiteBinding = {
  baseUrl: string;
  secret: string | null;
  version: number;
};

export const SUITE_API_VERSION = 1;

function suiteBaseUrl(): string {
  const base = process.env.SUITE_API_BASE_URL;
  if (!base) throw new Error("SUITE_API_BASE_URL is not set");
  return base.replace(/\/$/, "");
}

export function defaultBinding(): SuiteBinding {
  return { baseUrl: suiteBaseUrl(), secret: null, version: SUITE_API_VERSION };
}

type SuiteError = { error: string };

function unexpected(): Error {
  return new Error("The resort's system answered unexpectedly. Please try again.");
}

async function suiteFetch(binding: SuiteBinding, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${binding.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Concierge-Suite-Version": String(binding.version),
      ...(binding.secret ? { Authorization: `Bearer ${binding.secret}` } : {}),
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as SuiteError | Record<string, unknown> | null;
  if (!res.ok) {
    const message =
      (data as SuiteError | null)?.error ??
      (res.status === 409
        ? "sold out"
        : res.status === 404
          ? "not found"
          : `Suite responded ${res.status}`);
    throw new Error(String(message));
  }
  return data;
}

export type Availability = {
  available: number;
  units?: string[];
};

export type BookingGuest = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
};

export type BookingDraft = {
  id: string;
  bookingCode: string;
  totalAmountPoisha: number;
};

export type BookingLookup = {
  bookingCode: string;
  firstName: string;
  checkIn: string;
  checkOut: string;
  status: string;
};

export interface SuiteAdapter {
  getAvailability(roomId: string, checkIn: string, checkOut: string): Promise<Availability>;
  createBooking(roomId: string, guest: BookingGuest, checkIn: string, checkOut: string): Promise<BookingDraft>;
  lookupBookingByCode(code: string): Promise<BookingLookup>;
  requestBookingDetails(contact: { email?: string; phone?: string }): Promise<{ sent: boolean }>;
  ping(): Promise<{ ok: boolean; suiteVersion: number }>;
}

export class HttpSuiteAdapter implements SuiteAdapter {
  constructor(private binding: SuiteBinding) {}

  async getAvailability(roomId: string, checkIn: string, checkOut: string): Promise<Availability> {
    const data = (await suiteFetch(
      this.binding,
      `/api/rooms/${encodeURIComponent(roomId)}/availability?checkIn=${checkIn}&checkOut=${checkOut}`
    )) as { available: number; units?: string[] };
    if (typeof data?.available !== "number") throw unexpected();
    return { available: data.available, units: data.units };
  }

  async createBooking(
    roomId: string,
    guest: BookingGuest,
    checkIn: string,
    checkOut: string
  ): Promise<BookingDraft> {
    const data = (await suiteFetch(this.binding, "/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        roomId,
        guestName: guest.guestName,
        guestEmail: guest.guestEmail,
        guestPhone: guest.guestPhone,
        checkInDate: checkIn,
        checkOutDate: checkOut,
      }),
    })) as { booking: BookingDraft };
    const booking = data?.booking;
    if (
      !booking ||
      typeof booking.bookingCode !== "string" ||
      typeof booking.totalAmountPoisha !== "number"
    ) {
      throw unexpected();
    }
    return booking;
  }

  async lookupBookingByCode(code: string): Promise<BookingLookup> {
    const data = (await suiteFetch(
      this.binding,
      `/api/bookings/lookup?code=${encodeURIComponent(code)}`
    )) as BookingLookup & { checkInDate?: string; checkOutDate?: string };
    // Live demo1 returns checkInDate/checkOutDate (verified 2026-10-28);
    // accept both shapes so the code path never yields undefined dates.
    const checkIn = data?.checkIn ?? data?.checkInDate ?? "";
    const checkOut = data?.checkOut ?? data?.checkOutDate ?? "";
    if (!data || typeof data.bookingCode !== "string" || !checkIn || !checkOut) {
      throw unexpected();
    }
    return {
      bookingCode: data.bookingCode,
      firstName: typeof data.firstName === "string" ? data.firstName : "",
      checkIn,
      checkOut,
      status: typeof data.status === "string" ? data.status : "",
    };
  }

  async requestBookingDetails(contact: {
    email?: string;
    phone?: string;
  }): Promise<{ sent: boolean }> {
    const data = (await suiteFetch(this.binding, "/api/bookings/send-details", {
      method: "POST",
      body: JSON.stringify(contact),
    })) as { sent: boolean };
    if (!data || typeof data.sent !== "boolean") throw unexpected();
    return { sent: data.sent };
  }

  async ping(): Promise<{ ok: boolean; suiteVersion: number }> {
    const data = (await suiteFetch(this.binding, "/api/concierge/ping")) as {
      ok: boolean;
      suiteVersion: number;
    };
    if (!data || data.ok !== true) throw unexpected();
    return { ok: true, suiteVersion: data.suiteVersion ?? 0 };
  }
}

// Per-property adapter (Phase 2). A property WITH a binding row talks to
// its own backend; the demo property WITHOUT one falls back to the env
// URL (zero-downtime cutover until its row is seeded); any other property
// without a row fails honestly instead of silently borrowing demo1.
export async function adapterForProperty(propertyId: string): Promise<SuiteAdapter> {
  const row = await prisma.propertyBinding.findUnique({ where: { propertyId } });
  if (!row) {
    if (propertyId === (process.env.DEMO_PROPERTY_ID ?? "krishnachura-retreat")) {
      return new HttpSuiteAdapter(defaultBinding());
    }
    throw new Error(`Property "${propertyId}" is not connected to a booking backend.`);
  }
  const secret = row.secretEnc ? decryptSecret(row.secretEnc) : null;
  return new HttpSuiteAdapter({
    baseUrl: row.suiteBaseUrl.replace(/\/$/, ""),
    secret,
    version: row.version,
  });
}

// Default-binding path (Phase 1 behavior: identical to the old module).
// A fresh adapter per call keeps env reads lazy, exactly like before.
export async function getAvailability(
  roomId: string,
  checkIn: string,
  checkOut: string
): Promise<Availability> {
  return new HttpSuiteAdapter(defaultBinding()).getAvailability(roomId, checkIn, checkOut);
}

export async function createBooking(
  roomId: string,
  guest: BookingGuest,
  checkIn: string,
  checkOut: string
): Promise<BookingDraft> {
  return new HttpSuiteAdapter(defaultBinding()).createBooking(roomId, guest, checkIn, checkOut);
}

export async function lookupBookingByCode(code: string): Promise<BookingLookup> {
  return new HttpSuiteAdapter(defaultBinding()).lookupBookingByCode(code);
}

export async function requestBookingDetails(contact: {
  email?: string;
  phone?: string;
}): Promise<{ sent: boolean }> {
  return new HttpSuiteAdapter(defaultBinding()).requestBookingDetails(contact);
}
