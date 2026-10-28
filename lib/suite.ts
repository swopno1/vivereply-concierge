// Suite HTTP client (step 2a). The Concierge NEVER touches the Suite
// database — it talks to the Suite's public HTTP endpoints only, and only
// from the server (never from the browser).
//
// Contracts verified against travel-scaffold@client/demo1:
// - GET /api/rooms/[roomId]/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
//   -> { roomId, checkIn, checkOut, available: number, units?: string[] }
// - POST /api/bookings { roomId, guestName, guestEmail, guestPhone,
//   nidOrPassport?, address?, checkInDate, checkOutDate }
//   -> { success: true, booking: { id, bookingCode, totalAmountPoisha } }
//   Errors: 400 missing/invalid, 404 room not found, 409 sold out.
//
// Demo binding: SUITE_API_BASE_URL + DEMO_PROPERTY_ID from env. A real
// multi-property setup looks up PropertyBinding by workspaceId instead.

function suiteBaseUrl(): string {
  const base = process.env.SUITE_API_BASE_URL;
  if (!base) throw new Error("SUITE_API_BASE_URL is not set");
  return base.replace(/\/$/, "");
}

type SuiteError = { error: string };

async function suiteFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${suiteBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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

export async function getAvailability(
  roomId: string,
  checkIn: string,
  checkOut: string
): Promise<Availability> {
  const data = (await suiteFetch(
    `/api/rooms/${encodeURIComponent(roomId)}/availability?checkIn=${checkIn}&checkOut=${checkOut}`
  )) as { available: number; units?: string[] };
  return { available: data.available, units: data.units };
}

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

export async function createBooking(
  roomId: string,
  guest: BookingGuest,
  checkIn: string,
  checkOut: string
): Promise<BookingDraft> {
  const data = (await suiteFetch("/api/bookings", {
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
  return data.booking;
}
export type BookingLookup = {
  bookingCode: string;
  firstName: string;
  checkIn: string;
  checkOut: string;
  status: string;
};

export async function lookupBookingByCode(code: string): Promise<BookingLookup> {
  const data = (await suiteFetch(
    `/api/bookings/lookup?code=${encodeURIComponent(code)}`
  )) as BookingLookup & { checkInDate?: string; checkOutDate?: string };
  // Live demo1 returns checkInDate/checkOutDate (verified 2026-10-28);
  // accept both shapes so the code path never yields undefined dates.
  data.checkIn = data.checkIn ?? data.checkInDate ?? "";
  data.checkOut = data.checkOut ?? data.checkOutDate ?? "";
  return data;
}

export async function requestBookingDetails(contact: {
  email?: string;
  phone?: string;
}): Promise<{ sent: boolean }> {
  const data = (await suiteFetch("/api/bookings/send-details", {
    method: "POST",
    body: JSON.stringify(contact),
  })) as { sent: boolean };
  return data;
}
