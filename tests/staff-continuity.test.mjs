// Staff↔guest continuity tests (Handover F §9 + A5). The lib/handoffs.ts
// core runs against a stub tx with the same method surface as the real
// one — every transition, mirror write, and system line below executes
// the shipped logic. Route-level auth/404 wiring has no harness in this
// repo (DB + Next runtime); it is reviewed + live-verified instead.
// The stub surface is closed: anything the helpers must never touch
// (tools, model calls) simply does not exist on it.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  HandoffClosedError,
  appendHandoffNotice,
  appendStaffReply,
  applyContactCapture,
  applyHandoffSideEffects,
  botReturnLine,
  contactAskNotice,
  contactConfirmationLine,
  ensureConversationHandoff,
  hasActiveHandoff,
  holdingLine,
  holdingLineDue,
  latestActiveHandoff,
  latestMessagesByConversation,
  pageAfter,
  runStaffModeTurn,
  shapeGuestThreadPayload,
  staffJoinedLine,
  validateReplyInput,
} from "@/lib/handoffs";
import { capHistoryForModel } from "@/lib/history";
import { verifyGuestThreadToken } from "@/lib/guest-thread";

// --- stub tx -----------------------------------------------------------

function matches(row, where = {}) {
  for (const [key, cond] of Object.entries(where)) {
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      if ("in" in cond) {
        if (!cond.in.includes(row[key])) return false;
        continue;
      }
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function project(row, select) {
  if (!select) return { ...row };
  const out = {};
  for (const [key, want] of Object.entries(select)) {
    if (want) out[key] = row[key];
  }
  return out;
}

function order(rows, orderBy) {
  if (!orderBy) return rows;
  const [[key, dir]] = Object.entries(orderBy);
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * sign);
}

/** In-memory tx twin. Journal records every write for exactly-once assertions. */
function stubTx(seed = {}) {
  const store = {
    handoffs: [...(seed.handoffs ?? [])],
    conversations: [...(seed.conversations ?? [])],
    messages: [...(seed.messages ?? [])],
    rawRows: seed.rawRows ?? [],
    journal: [],
  };
  let n = 0;
  const tx = {
    store,
    handoffRecord: {
      findFirst: async (args) => {
        const hit = order(store.handoffs.filter((r) => matches(r, args.where)), args.orderBy)[0];
        return hit ? project(hit, args.select) : null;
      },
      findUnique: async (args) => {
        const hit = store.handoffs.find((r) => matches(r, args.where));
        return hit ? (args.select ? project(hit, args.select) : { ...hit }) : null;
      },
      count: async (args) => store.handoffs.filter((r) => matches(r, args.where)).length,
      create: async (args) => {
        // Mirrors the schema default (status OPEN) like real Prisma does.
        const row = { id: `h${++n}`, createdAt: new Date(), status: "OPEN", guestPhone: null, guestEmail: null, ...args.data };
        store.handoffs.push(row);
        store.journal.push({ op: "handoff.create", row });
        return args.select ? project(row, args.select) : { ...row };
      },
      update: async (args) => {
        const row = store.handoffs.find((r) => matches(r, args.where));
        Object.assign(row, args.data);
        store.journal.push({ op: "handoff.update", where: args.where, data: args.data });
        return { ...row };
      },
    },
    conversation: {
      findUnique: async (args) => {
        const hit = store.conversations.find((r) => matches(r, args.where));
        return hit ? (args.select ? project(hit, args.select) : { ...hit }) : null;
      },
      update: async (args) => {
        const row = store.conversations.find((r) => matches(r, args.where));
        Object.assign(row, args.data);
        store.journal.push({ op: "conversation.update", where: args.where, data: args.data });
        return { ...row };
      },
    },
    message: {
      findFirst: async (args) => {
        const hit = order(store.messages.filter((r) => matches(r, args.where)), args.orderBy)[0];
        return hit ? project(hit, args.select) : null;
      },
      findMany: async (args) => {
        let rows = order(store.messages.filter((r) => matches(r, args.where)), args.orderBy);
        if (args.take !== undefined) rows = rows.slice(0, args.take);
        return rows.map((r) => project(r, args.select));
      },
      create: async (args) => {
        const row = { id: `m${++n}`, author: null, createdAt: new Date(), ...args.data };
        store.messages.push(row);
        store.journal.push({ op: "message.create", row });
        return args.select ? project(row, args.select) : { ...row };
      },
    },
    $queryRaw: async () => store.rawRows,
  };
  return tx;
}

const CONV = (over = {}) => ({
  id: "conv-1",
  propertyId: "prop-1",
  language: "en",
  status: "OPEN",
  ...over,
});
const HANDOFF = (over = {}) => ({
  id: "h-1",
  conversationId: "conv-1",
  status: "OPEN",
  guestPhone: null,
  guestEmail: null,
  createdAt: new Date("2026-11-12T10:00:00Z"),
  ...over,
});
const MSG = (over = {}) => ({
  id: `seed-${Math.random().toString(36).slice(2)}`,
  conversationId: "conv-1",
  role: "user",
  author: null,
  content: "hi",
  createdAt: new Date("2026-11-12T10:00:00Z"),
  ...over,
});

// --- verbatim copy (§3 + A1 + A4) ---------------------------------------

describe("guest copy (verbatim)", () => {
  it("staff-joined line names the author, EN + BN", () => {
    assert.equal(staffJoinedLine("Rahim Uddin", "en"), "Rahim Uddin from the resort team has joined this conversation.");
    assert.equal(staffJoinedLine("Rahim Uddin", "bn"), "রিসোর্ট টিম থেকে Rahim Uddin এই কথোপকথনে যোগ দিয়েছেন।");
  });
  it("holding line, EN + BN", () => {
    assert.equal(
      holdingLine("en"),
      "Thanks — this conversation is with our team now, and they'll reply here. You can keep writing; they'll see everything you send."
    );
    assert.equal(
      holdingLine("bn"),
      "ধন্যবাদ — এই কথোপকথনটি এখন আমাদের টিমের কাছে আছে, তাঁরা এখানেই উত্তর দেবেন। আপনি লিখতে থাকুন; আপনি যা পাঠাবেন সবই তাঁরা দেখতে পাবেন।"
    );
  });
  it("bot-return line, EN + BN", () => {
    assert.equal(
      botReturnLine("en"),
      "You're back with our automated assistant. Ask me anything — and if you'd like to talk to a person again, just say so."
    );
    assert.equal(
      botReturnLine("bn"),
      "আপনি আবার আমাদের অটোমেটেড অ্যাসিস্ট্যান্টের কাছে ফিরে এসেছেন। যেকোনো কিছু জিজ্ঞাসা করুন — আর আবার কোনো ব্যক্তির সঙ্গে কথা বলতে চাইলে শুধু বলুন।"
    );
  });
  it("contact ask, with and without the resort phone, EN + BN", () => {
    assert.equal(
      contactAskNotice("01712345678", "en"),
      "A member of our team will reply here — it may take a little while. If you'd rather not wait, share your phone, WhatsApp number, or email in this chat and the team will contact you. You can also reach the resort directly at 01712345678."
    );
    assert.equal(
      contactAskNotice(null, "en"),
      "A member of our team will reply here — it may take a little while. If you'd rather not wait, share your phone, WhatsApp number, or email in this chat and the team will contact you."
    );
    assert.equal(
      contactAskNotice("01712345678", "bn"),
      "আমাদের টিমের একজন সদস্য এখানেই উত্তর দেবেন — কিছুটা সময় লাগতে পারে। অপেক্ষা করতে না চাইলে এই চ্যাটে আপনার ফোন, হোয়াটসঅ্যাপ নম্বর বা ইমেইল দিয়ে দিন, টিম আপনার সঙ্গে যোগাযোগ করবে। আপনি চাইলে সরাসরি রিসোর্টে ফোনও করতে পারেন: 01712345678।"
    );
    assert.ok(!contactAskNotice(null, "bn").includes("ফোনও করতে পারেন"));
  });
  it("confirmation line never echoes a value, EN + BN", () => {
    assert.equal(
      contactConfirmationLine("en"),
      "Thanks — we've passed your contact details to the team. They'll reach out as soon as they can."
    );
    assert.equal(
      contactConfirmationLine("bn"),
      "ধন্যবাদ — আপনার যোগাযোগের তথ্য টিমের কাছে পৌঁছে দেওয়া হয়েছে। তাঁরা যত তাড়াতাড়ি সম্ভব যোগাযোগ করবেন।"
    );
  });
});

// --- replies (§2a) -----------------------------------------------------

describe("validateReplyInput", () => {
  it("accepts a named author and a body", () => {
    assert.deepEqual(validateReplyInput({ author: " Rafi ", body: " Yes. " }), {
      ok: true,
      author: "Rafi",
      body: "Yes.",
    });
  });
  it("400s on missing/overlong author or body", () => {
    for (const body of [
      {},
      { author: "", body: "x" },
      { author: "x".repeat(101), body: "x" },
      { author: "Rafi", body: "" },
      { author: "Rafi", body: "x".repeat(2001) },
    ]) {
      assert.equal(validateReplyInput(body).ok, false, JSON.stringify(body).slice(0, 40));
    }
  });
});

describe("appendStaffReply", () => {
  it("writes the staff message with author and flips OPEN → IN_PROGRESS", async () => {
    const tx = stubTx({ handoffs: [HANDOFF()], conversations: [CONV({ status: "HANDED_OFF" })] });
    const out = await appendStaffReply(tx, {
      handoffId: "h-1",
      conversationId: "conv-1",
      author: "Rafi",
      body: "Yes — sea-facing rooms are free.",
      lang: "en",
    });
    assert.equal(out.message.role, "staff");
    assert.equal(out.message.author, "Rafi");
    assert.equal(out.message.content, "Yes — sea-facing rooms are free.");
    assert.equal(out.handoffStatus, "IN_PROGRESS");
    assert.equal(tx.store.handoffs[0].status, "IN_PROGRESS");
  });
  it("prepends the staff-joined line before the first reply only", async () => {
    const tx = stubTx({ handoffs: [HANDOFF()], conversations: [CONV()] });
    const first = await appendStaffReply(tx, {
      handoffId: "h-1",
      conversationId: "conv-1",
      author: "Rafi",
      body: "Hello.",
      lang: "en",
    });
    assert.equal(first.joined, true);
    const roles = tx.store.messages.map((m) => m.role);
    assert.deepEqual(roles, ["system", "staff"]);
    assert.equal(tx.store.messages[0].content, "Rafi from the resort team has joined this conversation.");
    const second = await appendStaffReply(tx, {
      handoffId: "h-1",
      conversationId: "conv-1",
      author: "Rafi",
      body: "Again.",
      lang: "en",
    });
    assert.equal(second.joined, false);
    assert.equal(tx.store.messages.filter((m) => m.role === "system").length, 1);
  });
  it("rejects a CLOSED handoff without writing", async () => {
    const tx = stubTx({ handoffs: [HANDOFF({ status: "CLOSED" })], conversations: [CONV()] });
    await assert.rejects(
      appendStaffReply(tx, { handoffId: "h-1", conversationId: "conv-1", author: "R", body: "x", lang: "en" }),
      (e) => e instanceof HandoffClosedError
    );
    assert.equal(tx.store.messages.length, 0);
  });
  it("rejects a handoff from another conversation", async () => {
    const tx = stubTx({ handoffs: [HANDOFF({ conversationId: "conv-9" })], conversations: [CONV()] });
    await assert.rejects(
      appendStaffReply(tx, { handoffId: "h-1", conversationId: "conv-1", author: "R", body: "x", lang: "en" })
    );
  });
});

// --- PATCH side effects (§2b) -------------------------------------------

describe("applyHandoffSideEffects", () => {
  it("close of the last active handoff hands back + appends the bot-return line", async () => {
    const tx = stubTx({
      handoffs: [HANDOFF({ status: "CLOSED" })],
      conversations: [CONV({ status: "HANDED_OFF" })],
    });
    const out = await applyHandoffSideEffects(tx, { conversationId: "conv-1", transition: "close", lang: "en" });
    assert.deepEqual(out, { mode: "BOT", botReturned: true });
    assert.equal(tx.store.conversations[0].status, "OPEN");
    assert.equal(tx.store.messages.length, 1);
    assert.equal(tx.store.messages[0].role, "system");
    assert.equal(
      tx.store.messages[0].content,
      "You're back with our automated assistant. Ask me anything — and if you'd like to talk to a person again, just say so."
    );
  });
  it("close while another handoff stays active changes neither mirror nor thread", async () => {
    const tx = stubTx({
      handoffs: [HANDOFF({ id: "h-1", status: "CLOSED" }), HANDOFF({ id: "h-2", status: "OPEN" })],
      conversations: [CONV({ status: "HANDED_OFF" })],
    });
    const out = await applyHandoffSideEffects(tx, { conversationId: "conv-1", transition: "close", lang: "en" });
    assert.deepEqual(out, { mode: "STAFF", botReturned: false });
    assert.equal(tx.store.conversations[0].status, "HANDED_OFF");
    assert.equal(tx.store.messages.length, 0);
  });
  it("reopen re-enters STAFF mode with no system line", async () => {
    const tx = stubTx({
      handoffs: [HANDOFF({ status: "OPEN" })],
      conversations: [CONV({ status: "OPEN" })],
    });
    const out = await applyHandoffSideEffects(tx, { conversationId: "conv-1", transition: "reopen", lang: "en" });
    assert.deepEqual(out, { mode: "STAFF", botReturned: false });
    assert.equal(tx.store.conversations[0].status, "HANDED_OFF");
    assert.equal(tx.store.messages.length, 0);
  });
  it("assignee-only transitions just recompute the mirror", async () => {
    const tx = stubTx({ handoffs: [], conversations: [CONV({ status: "HANDED_OFF" })] });
    const out = await applyHandoffSideEffects(tx, { conversationId: "conv-1", transition: "other", lang: "bn" });
    assert.deepEqual(out, { mode: "BOT", botReturned: false });
    assert.equal(tx.store.conversations[0].status, "OPEN");
  });
});

// --- dedupe + mode -------------------------------------------------------

describe("ensureConversationHandoff", () => {
  it("creates once, then returns the existing record without a second row", async () => {
    const tx = stubTx({ conversations: [CONV()] });
    const first = await ensureConversationHandoff(tx, { conversationId: "conv-1", reason: "r", summary: "s" });
    assert.equal(first.created, true);
    const second = await ensureConversationHandoff(tx, { conversationId: "conv-1", reason: "r", summary: "s" });
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);
    assert.equal(tx.store.handoffs.length, 1);
    assert.equal(tx.store.conversations[0].status, "HANDED_OFF");
  });
  it("creates again when only CLOSED handoffs exist", async () => {
    const tx = stubTx({ handoffs: [HANDOFF({ status: "CLOSED" })], conversations: [CONV({ status: "OPEN" })] });
    const out = await ensureConversationHandoff(tx, { conversationId: "conv-1", reason: "r", summary: "s" });
    assert.equal(out.created, true);
  });
});

describe("mode derivation", () => {
  it("hasActiveHandoff is true for OPEN/IN_PROGRESS only", async () => {
    const tx = stubTx({ handoffs: [HANDOFF({ status: "IN_PROGRESS" })] });
    assert.equal(await hasActiveHandoff(tx, "conv-1"), true);
    const tx2 = stubTx({ handoffs: [HANDOFF({ status: "CLOSED" })] });
    assert.equal(await hasActiveHandoff(tx2, "conv-1"), false);
    const tx3 = stubTx({});
    assert.equal(await hasActiveHandoff(tx3, "conv-1"), false);
  });
  it("latestActiveHandoff picks the newest active row (contact target)", async () => {
    const tx = stubTx({
      handoffs: [
        HANDOFF({ id: "old", status: "OPEN", createdAt: new Date("2026-11-12T09:00:00Z") }),
        HANDOFF({ id: "new", status: "IN_PROGRESS", createdAt: new Date("2026-11-12T11:00:00Z") }),
        HANDOFF({ id: "shut", status: "CLOSED", createdAt: new Date("2026-11-12T12:00:00Z") }),
      ],
    });
    const out = await latestActiveHandoff(tx, "conv-1");
    assert.equal(out?.id, "new");
  });
});

// --- holding line + staff-mode turn (§4) ----------------------------------

describe("holdingLineDue", () => {
  const line = holdingLine("en");
  it("due on a bare thread, not due right after itself", async () => {
    const tx = stubTx({ messages: [MSG({ content: "hello" })] });
    assert.equal(await holdingLineDue(tx, "conv-1", line), true);
    const tx2 = stubTx({
      messages: [
        MSG({ content: line, role: "system", createdAt: new Date("2026-11-12T10:01:00Z") }),
        MSG({ content: "hello again", createdAt: new Date("2026-11-12T10:02:00Z") }),
      ],
    });
    assert.equal(await holdingLineDue(tx2, "conv-1", line), false);
  });
});

describe("runStaffModeTurn", () => {
  it("returns null in BOT mode (no active handoff)", async () => {
    const tx = stubTx({ conversations: [CONV()] });
    assert.equal(await runStaffModeTurn(tx, { conversationId: "conv-1", guestMessage: "hi", lang: "en" }), null);
  });
  it("sends the holding line once, then silence", async () => {
    const tx = stubTx({
      handoffs: [HANDOFF()],
      conversations: [CONV({ status: "HANDED_OFF" })],
      messages: [MSG({ content: "i need a person" })],
    });
    const first = await runStaffModeTurn(tx, { conversationId: "conv-1", guestMessage: "hello?", lang: "en" });
    assert.equal(first?.replyRole, "system");
    assert.equal(first?.reply, holdingLine("en"));
    // Second turn: the guest message is saved by the route first; the
    // predecessor is now the holding line. (Explicit future timestamp:
    // the stub stamps creates with wall-clock time.)
    tx.store.messages.push(MSG({ content: "anything yet?", createdAt: new Date(Date.now() + 60000) }));
    const second = await runStaffModeTurn(tx, { conversationId: "conv-1", guestMessage: "anything yet?", lang: "en" });
    assert.deepEqual(second, { reply: "", replyRole: "system" });
  });
  it("captures typed contact instead of the holding line", async () => {
    const tx = stubTx({
      handoffs: [HANDOFF()],
      conversations: [CONV({ status: "HANDED_OFF" })],
      messages: [MSG({ content: "i need a person" })],
    });
    const out = await runStaffModeTurn(tx, {
      conversationId: "conv-1",
      guestMessage: "reach me at 01712345678",
      lang: "en",
    });
    assert.equal(out?.reply, contactConfirmationLine("en"));
    assert.equal(tx.store.handoffs[0].guestPhone, "01712345678");
    assert.ok(!tx.store.messages.some((m) => m.content === holdingLine("en")));
  });
  it("a retyped identical value falls through to the holding logic", async () => {
    const tx = stubTx({
      handoffs: [HANDOFF({ guestPhone: "01712345678" })],
      conversations: [CONV({ status: "HANDED_OFF" })],
      messages: [MSG({ content: "i need a person" })],
    });
    const out = await runStaffModeTurn(tx, {
      conversationId: "conv-1",
      guestMessage: "again: 01712 345678",
      lang: "en",
    });
    assert.equal(out?.reply, holdingLine("en"));
  });
  it("touches nothing but handoff/message/conversation rows (no agent seam exists here)", async () => {
    const tx = stubTx({
      handoffs: [HANDOFF()],
      conversations: [CONV({ status: "HANDED_OFF" })],
      messages: [MSG({ content: "hi" })],
    });
    await runStaffModeTurn(tx, { conversationId: "conv-1", guestMessage: "hi again", lang: "en" });
    for (const entry of tx.store.journal) {
      assert.match(entry.op, /^(handoff|message|conversation)\./);
    }
  });
});

// --- handoff notice (A1) + form capture (A2) -------------------------------

describe("appendHandoffNotice", () => {
  it("persists exactly one system line and returns it for the done event", async () => {
    const tx = stubTx({});
    const row = await appendHandoffNotice(tx, { conversationId: "conv-1", lang: "en", resortPhone: "01712345678" });
    assert.equal(tx.store.journal.filter((e) => e.op === "message.create").length, 1);
    assert.equal(row.content.includes("01712345678"), true);
  });
});

describe("applyContactCapture", () => {
  it("409-maps when no handoff is active (no writes)", async () => {
    const tx = stubTx({ handoffs: [HANDOFF({ status: "CLOSED" })] });
    assert.deepEqual(
      await applyContactCapture(tx, { conversationId: "conv-1", phone: "0171", email: null, lang: "en" }),
      { captured: false }
    );
    assert.equal(tx.store.journal.length, 0);
  });
  it("writes provided fields only + exactly one confirmation line", async () => {
    const tx = stubTx({ handoffs: [HANDOFF({ guestEmail: "old@x.com" })] });
    const out = await applyContactCapture(tx, {
      conversationId: "conv-1",
      phone: "01712345678",
      email: null,
      lang: "en",
    });
    assert.deepEqual(out, { captured: true });
    assert.equal(tx.store.handoffs[0].guestPhone, "01712345678");
    assert.equal(tx.store.handoffs[0].guestEmail, "old@x.com");
    const lines = tx.store.journal.filter((e) => e.op === "message.create");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].row.content, contactConfirmationLine("en"));
  });
});

// --- thread payload (§2d + A3) ---------------------------------------------

describe("pageAfter", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("pages after the cursor, fails soft on unknown/missing cursors", () => {
    assert.deepEqual(pageAfter(rows, "b").map((m) => m.id), ["c"]);
    assert.deepEqual(pageAfter(rows, "zzz").map((m) => m.id), ["a", "b", "c"]);
    assert.deepEqual(pageAfter(rows, null).map((m) => m.id), ["a", "b", "c"]);
    assert.deepEqual(pageAfter(rows, "c"), []);
  });
});

describe("shapeGuestThreadPayload", () => {
  const at = new Date("2026-11-12T10:00:00Z");
  const M = (id, role) => ({ id, role, author: role === "staff" ? "Rafi" : null, content: `${role}:${id}`, createdAt: at });
  it("shapes mode + window + contact + resort fields", () => {
    const out = shapeGuestThreadPayload({
      messagesAsc: [M("a", "user"), M("b", "staff"), M("c", "system")],
      after: "a",
      activeHandoff: { guestPhone: "0171", guestEmail: null },
      profile: { phone: "01719998888", email: "stay@resort.test" },
    });
    assert.equal(out.mode, "STAFF");
    assert.deepEqual(out.messages.map((m) => m.id), ["b", "c"]);
    assert.equal(out.messages[0].author, "Rafi");
    assert.equal(out.contactCaptured, true);
    assert.equal(out.resortPhone, "01719998888");
    assert.equal(out.resortEmail, "stay@resort.test");
  });
  it("BOT mode with no contact and no profile degrades to nulls", () => {
    const out = shapeGuestThreadPayload({ messagesAsc: [M("a", "user")], after: null, activeHandoff: null, profile: null });
    assert.equal(out.mode, "BOT");
    assert.equal(out.contactCaptured, false);
    assert.equal(out.resortPhone, null);
    assert.equal(out.resortEmail, null);
  });
  it("contactCaptured flips only when the active row holds contact", () => {
    const bare = shapeGuestThreadPayload({
      messagesAsc: [],
      after: null,
      activeHandoff: { guestPhone: null, guestEmail: null },
      profile: null,
    });
    assert.equal(bare.mode, "STAFF");
    assert.equal(bare.contactCaptured, false);
  });
});

describe("latestMessagesByConversation", () => {
  it("maps raw rows to a per-conversation lookup", async () => {
    const at = new Date("2026-11-12T10:00:00Z");
    const tx = stubTx({
      rawRows: [
        { conversationId: "c1", role: "user", at },
        { conversationId: "c2", role: "staff", at },
      ],
    });
    const out = await latestMessagesByConversation(tx, ["c1", "c2", "c3"]);
    assert.deepEqual(out.get("c1"), { role: "user", at });
    assert.deepEqual(out.get("c2"), { role: "staff", at });
    assert.equal(out.has("c3"), false);
  });
  it("skips the query entirely with no conversations", async () => {
    let queried = false;
    const tx = stubTx({});
    tx.$queryRaw = async () => {
      queried = true;
      return [];
    };
    assert.deepEqual(await latestMessagesByConversation(tx, []), new Map());
    assert.equal(queried, false);
  });
});

describe("verifyGuestThreadToken", () => {
  it("rejects missing/garbage tokens with the chat route's 403 (no DB touched)", async () => {
    for (const token of [null, "", "junk-token"]) {
      assert.deepEqual(await verifyGuestThreadToken(token), {
        ok: false,
        status: 403,
        error: "Chat token expired or invalid. Please reload the page.",
      });
    }
  });
  // Valid-token + domain + cross-property paths need the database and
  // are covered live (Cosmo acceptance), like the chat route's own.
});

// --- history mapping (§4 trap fix) ------------------------------------------

describe("capHistoryForModel roles", () => {
  it("passes user/assistant through and caps long text", () => {
    const out = capHistoryForModel([
      { role: "user", content: "hi" },
      { role: "assistant", content: "x".repeat(700) },
    ]);
    assert.equal(out[0].role, "user");
    assert.equal(out[1].role, "assistant");
    assert.ok(out[1].content.length <= 601);
  });
  it("maps staff to assistant with the staff prefix (never user)", () => {
    const out = capHistoryForModel([{ role: "staff", author: "Rafi", content: "Sea-facing is free." }]);
    assert.equal(out.length, 1);
    assert.equal(out[0].role, "assistant");
    assert.equal(out[0].content, "[Resort staff member Rafi]: Sea-facing is free.");
    for (const m of out) assert.notEqual(m.role, "user");
  });
  it("drops system lines entirely", () => {
    const out = capHistoryForModel([
      { role: "user", content: "hi" },
      { role: "system", content: "Thanks — this conversation is with our team now." },
      { role: "assistant", content: "hello" },
    ]);
    assert.deepEqual(out.map((m) => m.role), ["user", "assistant"]);
    assert.ok(out.every((m) => !m.content.includes("with our team now")));
  });
});
