// Language detection tests: the taka-sign regression is the one that
// matters — "budget around ৳15,000" must stay English, and a lone
// "৳15,000" must hold the language (null), never flip it.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { detectLanguage } from "@/lib/language";

describe("detectLanguage", () => {
  it("detects English", () => {
    assert.equal(detectLanguage("Is the Terracotta Villa available?"), "en");
  });
  it("detects Bengali letters", () => {
    assert.equal(detectLanguage("আমার একটি রুম লাগবে"), "bn");
  });
  it("keeps English when only the taka sign is Bengali-block", () => {
    assert.equal(detectLanguage("budget around ৳15,000"), "en");
  });
  it("returns null for letterless messages (date, price alone)", () => {
    assert.equal(detectLanguage("৳15,000"), null);
    assert.equal(detectLanguage("2026-11-10"), null);
    assert.equal(detectLanguage("???"), null);
  });
  it("lets an explicit switch request win", () => {
    assert.equal(detectLanguage("please reply in Bengali"), "bn");
    assert.equal(detectLanguage("আমার সাথে English এ কথা বলুন, reply in English"), "en");
  });
});
