// Staff↔guest continuity core (Handover F). The model, in one place:
//
//   STAFF mode  = the conversation has an OPEN or IN_PROGRESS handoff.
//   BOT mode    = anything else.
//   Conversation.status mirrors it ("HANDED_OFF" vs "OPEN").
//   Close of the last active handoff hands back to the bot; reopen
//   pauses again. The billing gate (chat route) keeps precedence —
//   nothing here runs before it.
//
// Every writer below runs INSIDE the caller's withTenant block (single
// tx); tests inject a stub tx with the same method surface. Guest copy
// is verbatim per the handover, keyed by conversation language.

import type { TenantTx } from "./tenant-db";
import { diffGuestContact, extractGuestContact } from "./guest-contact";

export const ACTIVE_HANDOFF_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

export type GuestLang = "en" | "bn";

export function staffJoinedLine(author: string, lang: GuestLang): string {
  return lang === "bn"
    ? `রিসোর্ট টিম থেকে ${author} এই কথোপকথনে যোগ দিয়েছেন।`
    : `${author} from the resort team has joined this conversation.`;
}

export function holdingLine(lang: GuestLang): string {
  return lang === "bn"
    ? "ধন্যবাদ — এই কথোপকথনটি এখন আমাদের টিমের কাছে আছে, তাঁরা এখানেই উত্তর দেবেন। আপনি লিখতে থাকুন; আপনি যা পাঠাবেন সবই তাঁরা দেখতে পাবেন।"
    : "Thanks — this conversation is with our team now, and they'll reply here. You can keep writing; they'll see everything you send.";
}

export function botReturnLine(lang: GuestLang): string {
  return lang === "bn"
    ? "আপনি আবার আমাদের অটোমেটেড অ্যাসিস্ট্যান্টের কাছে ফিরে এসেছেন। যেকোনো কিছু জিজ্ঞাসা করুন — আর আবার কোনো ব্যক্তির সঙ্গে কথা বলতে চাইলে শুধু বলুন।"
    : "You're back with our automated assistant. Ask me anything — and if you'd like to talk to a person again, just say so.";
}

// Amendment A1: the contact ask, appended as a system line on the turn
// that creates a handoff. The direct-call sentence appears only when
// the profile actually has a phone — never an invented number.
export function contactAskNotice(resortPhone: string | null, lang: GuestLang): string {
  if (lang === "bn") {
    const base =
      "আমাদের টিমের একজন সদস্য এখানেই উত্তর দেবেন — কিছুটা সময় লাগতে পারে। অপেক্ষা করতে না চাইলে এই চ্যাটে আপনার ফোন, হোয়াটসঅ্যাপ নম্বর বা ইমেইল দিয়ে দিন, টিম আপনার সঙ্গে যোগাযোগ করবে।";
    return resortPhone
      ? `${base} আপনি চাইলে সরাসরি রিসোর্টে ফোনও করতে পারেন: ${resortPhone}।`
      : base;
  }
  const base =
    "A member of our team will reply here — it may take a little while. If you'd rather not wait, share your phone, WhatsApp number, or email in this chat and the team will contact you.";
  return resortPhone ? `${base} You can also reach the resort directly at ${resortPhone}.` : base;
}

// Amendment A4: the capture confirmation. Never echoes the value back.
export function contactConfirmationLine(lang: GuestLang): string {
  return lang === "bn"
    ? "ধন্যবাদ — আপনার যোগাযোগের তথ্য টিমের কাছে পৌঁছে দেওয়া হয়েছে। তাঁরা যত তাড়াতাড়ি সম্ভব যোগাযোগ করবেন।"
    : "Thanks — we've passed your contact details to the team. They'll reach out as soon as they can.";
}

export type HandoffTransition = "close" | "reopen" | "other";

export class HandoffClosedError extends Error {
  constructor() {
    super("Handoff is closed.");
  }
}

/** STAFF mode derivation (§1): any OPEN/IN_PROGRESS handoff on the conversation. */
export async function hasActiveHandoff(tx: TenantTx, conversationId: string): Promise<boolean> {
  const found = await tx.handoffRecord.findFirst({
    where: { conversationId, status: { in: [...ACTIVE_HANDOFF_STATUSES] } },
    select: { id: true },
  });
  return found !== null;
}

export type ActiveHandoffRow = {
  id: string;
  status: string;
  guestPhone: string | null;
  guestEmail: string | null;
};

/**
 * The active handoff guest contact lands on: latest-created wins, so a
 * reopened episode owns new contact over a stale duplicate. Null when
 * the conversation is in BOT mode.
 */
export async function latestActiveHandoff(
  tx: TenantTx,
  conversationId: string
): Promise<ActiveHandoffRow | null> {
  return tx.handoffRecord.findFirst({
    where: { conversationId, status: { in: [...ACTIVE_HANDOFF_STATUSES] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, guestPhone: true, guestEmail: true },
  });
}

export type SystemLineRow = { id: string; content: string; createdAt: Date };

/** Append a role "system" line (author always null). Returns the persisted row. */
export async function appendSystemLine(
  tx: TenantTx,
  conversationId: string,
  content: string
): Promise<SystemLineRow> {
  return tx.message.create({
    data: { conversationId, role: "system", content },
    select: { id: true, content: true, createdAt: true },
  });
}

/**
 * Recompute the Conversation.status mirror from active-handoff existence
 * after a mutation. On a close that empties the active set, append the
 * bot-return line (hand-back); every other transition just mirrors.
 */
export async function applyHandoffSideEffects(
  tx: TenantTx,
  args: { conversationId: string; transition: HandoffTransition; lang: GuestLang }
): Promise<{ mode: "STAFF" | "BOT"; botReturned: boolean }> {
  const active = await tx.handoffRecord.count({
    where: { conversationId: args.conversationId, status: { in: [...ACTIVE_HANDOFF_STATUSES] } },
  });
  await tx.conversation.update({
    where: { id: args.conversationId },
    data: { status: active > 0 ? "HANDED_OFF" : "OPEN" },
  });
  if (args.transition === "close" && active === 0) {
    await appendSystemLine(tx, args.conversationId, botReturnLine(args.lang));
    return { mode: "BOT", botReturned: true };
  }
  return { mode: active > 0 ? "STAFF" : "BOT", botReturned: false };
}

export type StaffReplyRow = {
  id: string;
  role: string;
  author: string | null;
  content: string;
  createdAt: Date;
};

/**
 * Append a staff reply (§2a), in the caller's tx: the staff-joined line
 * first when no staff message exists yet on this conversation (a guest
 * meets the team once — reopen episodes don't re-introduce), then the
 * reply; flip OPEN → IN_PROGRESS. Rejects a CLOSED handoff (re-read in
 * tx, so a racing close can't slip a reply through).
 */
export async function appendStaffReply(
  tx: TenantTx,
  args: { handoffId: string; conversationId: string; author: string; body: string; lang: GuestLang }
): Promise<{ message: StaffReplyRow; handoffStatus: string; joined: boolean }> {
  const handoff = await tx.handoffRecord.findUnique({ where: { id: args.handoffId } });
  if (!handoff || handoff.conversationId !== args.conversationId) {
    throw new Error("Handoff not found.");
  }
  if (handoff.status === "CLOSED") {
    throw new HandoffClosedError();
  }
  const priorStaff = await tx.message.findFirst({
    where: { conversationId: args.conversationId, role: "staff" },
    select: { id: true },
  });
  let joined = false;
  if (!priorStaff) {
    await appendSystemLine(tx, args.conversationId, staffJoinedLine(args.author, args.lang));
    joined = true;
  }
  const message = await tx.message.create({
    data: { conversationId: args.conversationId, role: "staff", author: args.author, content: args.body },
    select: { id: true, role: true, author: true, content: true, createdAt: true },
  });
  const handoffStatus = handoff.status === "OPEN" ? "IN_PROGRESS" : handoff.status;
  if (handoffStatus !== handoff.status) {
    await tx.handoffRecord.update({ where: { id: args.handoffId }, data: { status: handoffStatus } });
  }
  await applyHandoffSideEffects(tx, {
    conversationId: args.conversationId,
    transition: "other",
    lang: args.lang,
  });
  return { message, handoffStatus, joined };
}

/**
 * request_handoff dedupe (§4): an active handoff already on the
 * conversation is returned instead of creating a duplicate; the mirror
 * is still ensured. Reports whether a row was actually created (only a
 * creation triggers the Amendment A1 notice).
 */
export async function ensureConversationHandoff(
  tx: TenantTx,
  args: { conversationId: string; reason: string; summary: string }
): Promise<{ id: string; created: boolean }> {
  const existing = await tx.handoffRecord.findFirst({
    where: { conversationId: args.conversationId, status: { in: [...ACTIVE_HANDOFF_STATUSES] } },
    select: { id: true },
  });
  if (existing) {
    await tx.conversation.update({
      where: { id: args.conversationId },
      data: { status: "HANDED_OFF" },
    });
    return { id: existing.id, created: false };
  }
  const created = await tx.handoffRecord.create({
    data: { conversationId: args.conversationId, reason: args.reason, summary: args.summary },
    select: { id: true },
  });
  await tx.conversation.update({
    where: { id: args.conversationId },
    data: { status: "HANDED_OFF" },
  });
  return { id: created.id, created: true };
}

/**
 * Holding-line dedupe (§4): due unless the message immediately preceding
 * the guest's just-saved turn message is already the holding line.
 */
export async function holdingLineDue(
  tx: TenantTx,
  conversationId: string,
  holdingText: string
): Promise<boolean> {
  const latest = await tx.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { content: true },
  });
  const predecessor = latest[1] ?? null;
  return predecessor === null || predecessor.content !== holdingText;
}

/** Reply input validation — identical messages to the notes routes. */
export function validateReplyInput(
  body: unknown
): { ok: true; author: string; body: string } | { ok: false; error: string } {
  const record = (body ?? {}) as { author?: unknown; body?: unknown };
  const author = typeof record.author === "string" ? record.author.trim() : "";
  const text = typeof record.body === "string" ? record.body.trim() : "";
  if (!author || author.length > 100) {
    return { ok: false, error: "Author is required (a staff name, max 100 characters)." };
  }
  if (!text || text.length > 2000) {
    return { ok: false, error: "Body is required (max 2000 characters)." };
  }
  return { ok: true, author, body: text };
}

/**
 * Latest message per conversation, one bounded query (§2c list rows).
 * DISTINCT ON keeps it to a single row per conversation no matter how
 * long the threads are; the id tiebreak keeps repeated polls stable.
 * Runs inside the caller's withTenant block, so Message RLS applies.
 */
export async function latestMessagesByConversation(
  tx: TenantTx,
  conversationIds: string[]
): Promise<Map<string, { role: string; at: Date }>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<Array<{ conversationId: string; role: string; at: Date }>>`
    SELECT DISTINCT ON ("conversationId") "conversationId", role, "createdAt" AS "at"
    FROM "Message"
    WHERE "conversationId" = ANY(${conversationIds}::text[])
    ORDER BY "conversationId", "createdAt" DESC, "id" DESC`;
  return new Map(rows.map((r) => [r.conversationId, { role: r.role, at: r.at }]));
}

/**
 * The staff-mode turn (§4 + A2): runs INSIDE the caller's tx. Finds the
 * active handoff (null → the conversation left STAFF mode in a race;
 * the route falls through to the BOT path), extracts contact from the
 * guest's message first (a changed value saves + confirms instead of
 * the holding line), else the holding line when due, else silence (the
 * guest's own bubble is already on screen). Never touches the agent.
 */
export async function runStaffModeTurn(
  tx: TenantTx,
  args: { conversationId: string; guestMessage: string; lang: GuestLang }
): Promise<{ reply: string; replyRole: "system" } | null> {
  const handoff = await latestActiveHandoff(tx, args.conversationId);
  if (!handoff) return null;
  const found = extractGuestContact(args.guestMessage);
  if (found.phone !== undefined || found.email !== undefined) {
    const diff = diffGuestContact(
      { guestPhone: handoff.guestPhone, guestEmail: handoff.guestEmail },
      found
    );
    if (diff.changed) {
      await tx.handoffRecord.update({
        where: { id: handoff.id },
        data: { guestPhone: diff.phone, guestEmail: diff.email },
      });
      const line = contactConfirmationLine(args.lang);
      await appendSystemLine(tx, args.conversationId, line);
      return { reply: line, replyRole: "system" };
    }
  }
  const holding = holdingLine(args.lang);
  if (await holdingLineDue(tx, args.conversationId, holding)) {
    await appendSystemLine(tx, args.conversationId, holding);
    return { reply: holding, replyRole: "system" };
  }
  return { reply: "", replyRole: "system" };
}

/**
 * Amendment A1 notice: appended once, on the turn that actually creates
 * a handoff. Returns the persisted row for the done event's
 * systemNotice field (the widget renders it immediately; poll and
 * history deliver it like every system line).
 */
export async function appendHandoffNotice(
  tx: TenantTx,
  args: { conversationId: string; lang: GuestLang; resortPhone: string | null }
): Promise<SystemLineRow> {
  return appendSystemLine(tx, args.conversationId, contactAskNotice(args.resortPhone, args.lang));
}

/**
 * Widget form capture (A2 path 1): stores the validated fields on the
 * active handoff and appends exactly one confirmation line. Only
 * provided fields are written — an absent field keeps its stored value.
 * Null when no handoff is active (the route answers 409).
 */
export async function applyContactCapture(
  tx: TenantTx,
  args: { conversationId: string; phone: string | null; email: string | null; lang: GuestLang }
): Promise<{ captured: boolean }> {
  const handoff = await latestActiveHandoff(tx, args.conversationId);
  if (!handoff) return { captured: false };
  await tx.handoffRecord.update({
    where: { id: handoff.id },
    data: {
      ...(args.phone !== null ? { guestPhone: args.phone } : {}),
      ...(args.email !== null ? { guestEmail: args.email } : {}),
    },
  });
  await appendSystemLine(tx, args.conversationId, contactConfirmationLine(args.lang));
  return { captured: true };
}

export type GuestThreadMessage = {
  id: string;
  role: string;
  author: string | null;
  content: string;
  createdAt: Date;
};

export type GuestThreadPayload = {
  mode: "BOT" | "STAFF";
  messages: Array<{ id: string; role: string; author: string | null; content: string; createdAt: string }>;
  contactCaptured: boolean;
  resortPhone: string | null;
  resortEmail: string | null;
};

/**
 * §2d + A3 response shaping (pure — the route supplies rows): latest-50
 * window paged after the cursor, mode from active-handoff existence,
 * contact flag from the active row, resort contact mirrored as stored.
 */
export function shapeGuestThreadPayload(args: {
  messagesAsc: GuestThreadMessage[];
  after: string | null | undefined;
  activeHandoff: { guestPhone: string | null; guestEmail: string | null } | null;
  profile: { phone: string | null; email: string | null } | null;
}): GuestThreadPayload {
  const window = pageAfter(args.messagesAsc, args.after);
  return {
    mode: args.activeHandoff ? "STAFF" : "BOT",
    messages: window.map((m) => ({
      id: m.id,
      role: m.role,
      author: m.author,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    contactCaptured:
      args.activeHandoff !== null &&
      (args.activeHandoff.guestPhone !== null || args.activeHandoff.guestEmail !== null),
    resortPhone: args.profile?.phone ?? null,
    resortEmail: args.profile?.email ?? null,
  };
}

/**
 * §2d paging over the conversation's latest 50 (ascending): messages
 * after the cursor id, or the whole window when the cursor is missing
 * or unknown (fail soft — never error the widget).
 */
export function pageAfter<T extends { id: string }>(
  messagesAsc: T[],
  after: string | null | undefined
): T[] {
  if (!after) return messagesAsc;
  const idx = messagesAsc.findIndex((m) => m.id === after);
  return idx < 0 ? messagesAsc : messagesAsc.slice(idx + 1);
}
