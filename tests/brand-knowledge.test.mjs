import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { answerBrand, BRAND_ENTRIES, BRAND_GREETING, BRAND_SUGGESTIONS } from "@/lib/brand-knowledge";

const allText = () =>
  BRAND_ENTRIES.map((e) => `${e.title}\n${e.body}`).join("\n") +
  "\n" + BRAND_GREETING +
  "\n" + [
    "hello", "What is ViveReply Suite?", "What does the Chatbot do?",
    "How does onboarding work?", "What is RoomReady?", "how much is the suite",
    "chatbot price", "book a room", "what is the weather",
  ].map((q) => answerBrand(q).reply).join("\n");

describe("brand knowledge guards (founder-standing)", () => {
  it("states no fee figures anywhere ($19/$49/$119, annuals, overages, Suite fees)", () => {
    const text = allText();
    assert.doesNotMatch(text, /\$\d/);
    for (const tier of ["$19", "$49", "$119", "19/month", "49/month", "119/month"]) {
      assert.ok(!text.includes(tier), `leaked tier figure: ${tier}`);
    }
  });
  it("never says MCP (front-desk agent framing only)", () => {
    assert.doesNotMatch(allText(), /mcp/i);
  });
  it("every entry is cited (title + label + url + keywords + body)", () => {
    for (const e of BRAND_ENTRIES) {
      assert.ok(e.id && e.title && e.sourceLabel && e.sourceUrl && e.body);
      assert.ok(e.keywords.length > 0, `${e.id} has no keywords`);
      assert.ok(e.sourceUrl.startsWith("https://"), `${e.id} source is not a URL`);
    }
  });
  it("brand suggestions are all answerable from the corpus", () => {
    assert.ok(BRAND_SUGGESTIONS.length >= 3);
    for (const s of BRAND_SUGGESTIONS) {
      const a = answerBrand(s);
      assert.equal(a.path, "retrieval", `"${s}" fell to ${a.path}`);
    }
  });
});

describe("brand answers (acceptance mapping)", () => {
  it("'Hello' greets with capabilities, never the error banner", () => {
    for (const q of ["Hello", "hi", "hey!", "  Hello  "]) {
      const a = answerBrand(q);
      assert.equal(a.path, "greeting");
      assert.match(a.reply, /brand assistant/);
      assert.doesNotMatch(a.reply, /unavailable/i);
    }
  });
  it("'hello, what is the suite?' routes past the greeting", () => {
    const a = answerBrand("hello, what is the suite?");
    assert.equal(a.entryId, "suite-overview");
  });
  it("'What is ViveReply Suite?' -> Resort PMS answer", () => {
    const a = answerBrand("What is ViveReply Suite?");
    assert.equal(a.entryId, "suite-overview");
    assert.match(a.reply, /Resort Property Management System/);
    assert.match(a.reply, /direct booking/i);
    assert.match(a.reply, /bilingual|Bengali/);
    assert.match(a.reply, /vivereply\.com\/suite/);
  });
  it("'What does the Chatbot do?' -> front-office answer, no prices", () => {
    const a = answerBrand("What does the Chatbot do?");
    assert.equal(a.entryId, "chatbot-overview");
    assert.match(a.reply, /front-office assistant/);
    assert.match(a.reply, /live/);
    assert.doesNotMatch(a.reply, /\$\d/);
  });
  it("'How does onboarding work?' -> sourced signup flow", () => {
    const a = answerBrand("How does onboarding work?");
    assert.equal(a.entryId, "onboarding");
    assert.match(a.reply, /Sign up/i);
    assert.match(a.reply, /owner-guide|docs/);
  });
  it("'What is RoomReady?' -> housekeeping add-on, flagged unpublished", () => {
    const a = answerBrand("What is RoomReady?");
    assert.equal(a.entryId, "roomready");
    assert.match(a.reply, /housekeeping add-on/i);
    assert.match(a.reply, /not a standalone product/);
  });
});

describe("brand deflects (no data invented)", () => {
  it("Suite pricing -> /contact, no figures", () => {
    const a = answerBrand("how much is the suite?");
    assert.equal(a.path, "pricing-suite");
    assert.match(a.reply, /vivereply\.com\/contact/);
    assert.doesNotMatch(a.reply, /\$\d/);
  });
  it("Chatbot pricing -> trial + subscription, no figures", () => {
    const a = answerBrand("chatbot price?");
    assert.equal(a.path, "pricing-chatbot");
    assert.match(a.reply, /30-day free trial/);
    assert.doesNotMatch(a.reply, /\$\d/);
  });
  it("room prices -> booking deflect, never a number", () => {
    const a = answerBrand("how much is a room?");
    assert.equal(a.path, "booking");
    assert.doesNotMatch(a.reply, /\$\d/);
  });
  it("booking intent deflects; feature questions retrieve", () => {
    assert.equal(answerBrand("book a room for friday").path, "booking");
    assert.equal(answerBrand("check availability").path, "booking");
    const feature = answerBrand("how does booking work?");
    assert.equal(feature.entryId, "chatbot-overview");
  });
  it("unknown stays honest with a contact pointer", () => {
    const a = answerBrand("what is the weather on mars?");
    assert.equal(a.path, "unknown");
    assert.match(a.reply, /don't have that/i);
    assert.match(a.reply, /vivereply\.com\/contact/);
  });
  it("every reply carries its path tag (troubleshooting visible)", () => {
    for (const q of ["hi", "What is ViveReply Suite?", "how much?", "book now", "zzz qqq"]) {
      assert.match(answerBrand(q).reply, /— Brand assistant · /);
    }
  });
});
