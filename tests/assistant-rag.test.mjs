import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  HONEST_UNKNOWN,
  detectAccountIntent,
  isViveReplyQuestion,
  routeLane,
} from "@/lib/assistant-rag";

describe("detectAccountIntent (R1)", () => {
  it("catches usage questions in English and Bengali", () => {
    assert.equal(detectAccountIntent("How many conversations do I have left?"), "usage");
    assert.equal(detectAccountIntent("What is my quota usage this month?"), "usage");
    assert.equal(detectAccountIntent("আমার আর কয়টি কথোপকথন বাকি আছে?"), "usage");
    assert.equal(detectAccountIntent("আমার কোটা কত?"), "usage");
  });

  it("catches plan and trial questions in English and Bengali", () => {
    assert.equal(detectAccountIntent("What plan am I on?"), "plan");
    assert.equal(detectAccountIntent("When does my trial end?"), "plan");
    assert.equal(detectAccountIntent("আমার প্ল্যান কোনটি?"), "plan");
    assert.equal(detectAccountIntent("ট্রায়ালের মেয়াদ কবে শেষ?"), "plan");
  });

  it("catches pause questions in English and Bengali", () => {
    assert.equal(detectAccountIntent("Why did guest chat pause?"), "pause");
    assert.equal(detectAccountIntent("Why is chat not working?"), "pause");
    assert.equal(detectAccountIntent("চ্যাট বন্ধ কেন?"), "pause");
  });

  it("leaves property questions alone", () => {
    assert.equal(detectAccountIntent("What is the deluxe room price?"), null);
    assert.equal(detectAccountIntent("Do you have suites with a sea view?"), null);
    assert.equal(detectAccountIntent("Book a room for Friday night"), null);
    assert.equal(detectAccountIntent("Is breakfast included?"), null);
    assert.equal(detectAccountIntent("hi there"), null);
  });
});

describe("isViveReplyQuestion (R1)", () => {
  it("matches ViveReply, product, billing, and support markers", () => {
    assert.equal(isViveReplyQuestion("What is ViveReply Suite?"), true);
    assert.equal(isViveReplyQuestion("How do I connect the Suite?"), true);
    assert.equal(isViveReplyQuestion("My widget is not loading"), true);
    assert.equal(isViveReplyQuestion("Where do I change my subscription?"), true);
    assert.equal(isViveReplyQuestion("Talk to a human please"), true);
    assert.equal(isViveReplyQuestion("PMS-এ রুম কিভাবে যোগ করব?"), true);
  });

  it("keeps room-type and stay questions on Lane B", () => {
    assert.equal(isViveReplyQuestion("Do you have suites with a sea view?"), false);
    assert.equal(isViveReplyQuestion("suite price for two nights?"), false);
    assert.equal(isViveReplyQuestion("What time is check-in?"), false);
    assert.equal(isViveReplyQuestion("Do you support early check-in?"), false);
    assert.equal(isViveReplyQuestion("Is there a pool?"), false);
  });
});

describe("routeLane (R1)", () => {
  it("prefers live account answers, then corpus, then Lane B", () => {
    assert.equal(routeLane({ accountIntent: "usage", corpusHit: true }), "lane-a-live");
    assert.equal(routeLane({ accountIntent: "usage", corpusHit: false }), "lane-a-live");
    assert.equal(routeLane({ accountIntent: null, corpusHit: true }), "lane-a-corpus");
    assert.equal(routeLane({ accountIntent: null, corpusHit: false }), "lane-b");
  });
});

describe("honest unknown (R1)", () => {
  it("offers the two real exits in both languages", () => {
    assert.match(HONEST_UNKNOWN.en, /Support page/);
    assert.match(HONEST_UNKNOWN.en, /\+8801819062270/);
    assert.match(HONEST_UNKNOWN.en, /WhatsApp/);
    assert.match(HONEST_UNKNOWN.bn, /Support/);
    assert.match(HONEST_UNKNOWN.bn, /\+8801819062270/);
  });
});
