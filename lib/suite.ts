// Suite HTTP adapter (spec: docs/suite-api-spec.md v1). The Concierge
// NEVER touches a Suite database — it talks to the Suite's HTTP endpoints
// only, and only from the server (never from the browser).
//
// Shape: SuiteAdapter (interface) + HttpSuiteAdapter (built per call from
// the property's binding row: base URL + optional secret + version). No
// property is special: no binding row means no backend, full stop.
//
// Response guards: a backend answering outside the spec yields an honest
// "answered unexpectedly" error (the agent surfaces it and offers a
// handoff), never a crash on undefined fields and never an invented number.

import { withTenant } from "@/lib/tenant-db";
import { decryptSecret } from "./secrets";

export type SuiteBinding = {
  baseUrl: string;
  secret: string | null;
  version: number;
};

export const SUITE_API_VERSION = 1;

/** Must match the Suite CURRENT_TERMS_VERSION (travel-scaffold src/lib/legal/version.ts). Bump together. */
export const SUITE_TERMS_VERSION = "v1";

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
    // 429 is a FIRST-CLASS signal, not a body parse: tools.ts maps
    // "rate_limited" to a try-again-later message, and a Suite that
    // answers 429 with an empty body must still land there. Hence the
    // status check runs before the body's error field is trusted.
    if (res.status === 429) throw new Error("rate_limited");
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

// Room catalogue fetch (Suite Handover D consumer): the booking system
// publishes its own room list. Same suiteFetch path as every other
// call (secret Bearer, version header, 15s timeout, no-store); raw JSON
// out — validation lives in lib/room-sync.ts, never here.
export async function fetchSuiteRooms(binding: SuiteBinding): Promise<unknown> {
  return suiteFetch(binding, "/api/concierge/rooms");
}

export interface SuiteAdapter {
  getAvailability(roomId: string, checkIn: string, checkOut: string): Promise<Availability>;
  createBooking(
    roomId: string,
    guest: BookingGuest,
    checkIn: string,
    checkOut: string,
    opts?: { idempotencyKey?: string; terms?: { accepted: boolean; version: string } }
  ): Promise<BookingDraft>;
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
    checkOut: string,
    opts?: { idempotencyKey?: string; terms?: { accepted: boolean; version: string } }
  ): Promise<BookingDraft> {
    // The Suite 400s drafts without terms; enforcing here keeps every
    // caller honest instead of failing at the network boundary.
    if (opts?.terms?.accepted !== true || !opts.terms.version) {
      throw new Error("Terms confirmation is required before drafting a booking.");
    }
    const data = (await suiteFetch(this.binding, "/api/bookings", {
      method: "POST",
      headers: opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {},
      body: JSON.stringify({
        roomId,
        guestName: guest.guestName,
        guestEmail: guest.guestEmail,
        guestPhone: guest.guestPhone,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        // The Suite reads the key from the body; the header stays for spec compliance.
        ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
        termsAccepted: true,
        termsVersion: opts.terms.version,
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

// Per-property adapter (Phase 2, multi-tenant core). Binding row or
// nothing: a property with its own row gets its own HTTP backend, and
// anything else fails honestly instead of borrowing another backend.
export type ResolvedSuiteBinding =
  | { kind: "http"; baseUrl: string; secret: string | null; version: number }
  | { kind: "none" };

/** Shared resolution behind adapterForProperty and the mapping health probe. */
export async function resolveSuiteBinding(propertyId: string): Promise<ResolvedSuiteBinding> {
  // Tenant path (call OUTSIDE tx blocks — helpers wrap internally).
  const row = await withTenant(propertyId, (tx) =>
    tx.propertyBinding.findUnique({ where: { propertyId } })
  );
  if (!row) {
    return { kind: "none" };
  }
  const secret = row.secretEnc ? decryptSecret(row.secretEnc) : null;
  return { kind: "http", baseUrl: row.suiteBaseUrl.replace(/\/$/, ""), secret, version: row.version };
}

export async function adapterForProperty(propertyId: string): Promise<SuiteAdapter> {
  const resolved = await resolveSuiteBinding(propertyId);
  if (resolved.kind === "http") {
    return new HttpSuiteAdapter({ baseUrl: resolved.baseUrl, secret: resolved.secret, version: resolved.version });
  }
  throw new Error(`Property "${propertyId}" is not connected to a booking backend.`);
}

export type BackendSource = "settings" | "none";

// Read-only mirror of adapterForProperty's decision for the Settings
// status banner. NEVER returns a secret — base URL only. Keep the two
// in sync: if the precedence below ever changes, adapterForProperty
// changes with it.
export async function describeBackendResolution(
  propertyId: string
): Promise<{ source: BackendSource; baseUrl: string | null }> {
  // Tenant path (call OUTSIDE tx blocks — helpers wrap internally).
  const row = await withTenant(propertyId, (tx) =>
    tx.propertyBinding.findUnique({
      where: { propertyId },
      select: { suiteBaseUrl: true },
    })
  );
  if (row) return { source: "settings", baseUrl: row.suiteBaseUrl };
  return { source: "none", baseUrl: null };
}
