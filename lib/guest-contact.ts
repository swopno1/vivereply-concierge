// Guest contact capture (Handover F, Amendment A). Two paths, one store
// (the active HandoffRecord's guestPhone/guestEmail — latest wins):
// the widget form (primary) and typed-in-chat extraction (fallback).
// Pure functions; the chat gate and the contact endpoint share them.

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

// A phone run: digits with +/spaces/dashes around them. Matched maximally,
// then rejected when a letter touches either side (so booking codes like
// RES-202610-00001 and ISO dates never yield a "number").
const PHONE_RUN_RE = /[0-9+\s-]*\d[0-9+\s-]*/g;

const LETTER_RE = /[A-Za-z]/;

export type FoundContact = { phone?: string; email?: string };

function digitsOf(candidate: string): string {
  return candidate.replace(/\D/g, "");
}

/**
 * Conservative extractor over one guest message: an email pattern, or
 * the first phone candidate (digits/+spaces/dashes with ≥10 digits, no
 * letter touching either side). Dates and prices fail the digit count;
 * booking codes fail adjacency (their digit runs touch letters). Values
 * returned as typed (edge whitespace/dashes trimmed, leading + kept);
 * {} when nothing matches.
 */
export function extractGuestContact(message: string): FoundContact {
  const found: FoundContact = {};
  const email = EMAIL_RE.exec(message)?.[0] ?? null;
  if (email) found.email = email;
  PHONE_RUN_RE.lastIndex = 0;
  let run: RegExpExecArray | null;
  while ((run = PHONE_RUN_RE.exec(message)) !== null) {
    const raw = run[0];
    // Span check on the whitespace-trimmed run: a digit run glued to a
    // letter by nothing but the run's own spaces ("is 017…") still
    // matches, while one glued by dashes ("RES-202610") does not.
    const leftPad = raw.length - raw.trimStart().length;
    const core = raw.trim();
    const spanStart = run.index + leftPad;
    const spanEnd = spanStart + core.length;
    const candidate = core.replace(/^[\s-]+|[\s-]+$/g, "");
    if (!candidate || digitsOf(candidate).length < 10) continue;
    const before = spanStart > 0 ? message[spanStart - 1] : "";
    const after = spanEnd < message.length ? message[spanEnd] : "";
    if ((before && LETTER_RE.test(before)) || (after && LETTER_RE.test(after))) continue;
    found.phone = candidate;
    break;
  }
  return found;
}

/** Form phone rule (A2): +/digits/spaces/dashes as typed, ≥10 digits. */
export function cleanContactPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[+\d][\d\s-]*$/.test(trimmed)) return null;
  return digitsOf(trimmed).length >= 10 ? trimmed : null;
}

/** Form email rule (A2): standard shape. */
export function cleanContactEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return EMAIL_RE.test(trimmed) && !/\s/.test(trimmed) ? trimmed : null;
}

export type ContactFormResult =
  | { ok: true; phone: string | null; email: string | null }
  | { ok: false; error: string };

/**
 * POST /api/chat/contact validation: at least one valid field required
 * (400 otherwise). A valid field is saved even when its sibling is
 * garbage — the garbage is dropped, not stored.
 */
export function validateContactForm(
  body: unknown
): ContactFormResult {
  const record = (body ?? {}) as { phone?: unknown; email?: unknown };
  const phone = cleanContactPhone(record.phone);
  const email = cleanContactEmail(record.email);
  if (phone === null && email === null) {
    return { ok: false, error: "Share a valid phone number or email address." };
  }
  return { ok: true, phone, email };
}

export type StoredContact = { guestPhone: string | null; guestEmail: string | null };

/**
 * Compare found contact against the stored row. Comparison normalizes
 * (digits-only for phones, lowercase for emails) so a retyped value in
 * different formatting doesn't nag-confirm; storage keeps as-typed.
 */
export function diffGuestContact(
  stored: StoredContact,
  found: FoundContact
): { changed: boolean; phone: string | null; email: string | null } {
  let phone = stored.guestPhone;
  let email = stored.guestEmail;
  let changed = false;
  if (found.phone !== undefined) {
    const same =
      stored.guestPhone !== null && digitsOf(stored.guestPhone) === digitsOf(found.phone);
    if (!same) {
      phone = found.phone;
      changed = true;
    }
  }
  if (found.email !== undefined) {
    const same =
      stored.guestEmail !== null &&
      stored.guestEmail.toLowerCase() === found.email.toLowerCase();
    if (!same) {
      email = found.email;
      changed = true;
    }
  }
  return { changed, phone, email };
}
