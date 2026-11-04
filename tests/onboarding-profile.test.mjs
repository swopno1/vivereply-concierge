// Onboarding profile parser tests: POST (submit) and PATCH (save-only)
// share this validation, so profile edits stay editable after the
// once-only ingestion gate has closed.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { cleanWebsite, optStr, parseProfileInput, str } from "@/lib/onboarding-profile";

describe("str/optStr", () => {
  it("trims and enforces max length", () => {
    assert.equal(str("  Hi  ", 10), "Hi");
    assert.equal(str("", 10), null);
    assert.equal(str("toolong", 3), null);
    assert.equal(str(42, 10), null);
  });
  it("treats empty as null, otherwise delegates", () => {
    assert.equal(optStr("", 10), null);
    assert.equal(optStr(undefined, 10), null);
    assert.equal(optStr("  x ", 10), "x");
    assert.equal(optStr("toolong", 3), null);
  });
});

describe("cleanWebsite", () => {
  it("accepts http(s) URLs, blanks to null, rejects the rest", () => {
    assert.equal(cleanWebsite("https://demo.example.com"), "https://demo.example.com");
    assert.equal(cleanWebsite(""), null);
    assert.equal(cleanWebsite(undefined), null);
    assert.equal(cleanWebsite("not a url"), "invalid");
    assert.equal(cleanWebsite("ftp://files.example.com"), "invalid");
    assert.equal(cleanWebsite(42), "invalid");
  });
});

describe("parseProfileInput", () => {
  it("accepts a full profile and trims fields", () => {
    const out = parseProfileInput({
      businessName: "  Demo Inn ",
      address: " Road 1 ",
      phone: "+8801",
      email: "a@b.c",
      website: "https://demo.example.com",
      assistantName: "Aria",
      tone: "warm",
      languages: ["en", " bn "],
      greeting: "Hello",
      suggestionSegments: ["dining"],
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.data.businessName, "Demo Inn");
    assert.equal(out.data.address, "Road 1");
    assert.deepEqual(out.data.languages, ["en", "bn"]);
  });
  it("requires a business name", () => {
    const out = parseProfileInput({ businessName: "  " });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.match(out.error, /Business name is required/);
  });
  it("rejects a bad website, honoring the top-level fallback", () => {
    const bad = parseProfileInput({ businessName: "X" }, "notaurl");
    assert.equal(bad.ok, false);
    const good = parseProfileInput({ businessName: "X" }, "https://demo.example.com");
    assert.equal(good.ok, true);
  });
  it("defaults languages and segments to empty lists", () => {
    const out = parseProfileInput({ businessName: "X" });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.deepEqual(out.data.languages, []);
    assert.deepEqual(out.data.suggestionSegments, []);
    assert.equal(out.data.website, null);
  });
});
