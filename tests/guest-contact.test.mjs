// Guest-contact tests (Amendment A2): the chat extractor is
// conservative (phones/emails in, dates/prices/codes out), the form
// validator requires at least one valid field, and retyped values
// compare normalized while storing as-typed. No database.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  cleanContactEmail,
  cleanContactPhone,
  diffGuestContact,
  extractGuestContact,
  validateContactForm,
} from "@/lib/guest-contact";

describe("extractGuestContact", () => {
  it("captures a BD mobile, an international format, and an email", () => {
    assert.deepEqual(extractGuestContact("call me on 01712345678 please"), { phone: "01712345678" });
    assert.deepEqual(extractGuestContact("my whatsapp is +880 1712-345678"), { phone: "+880 1712-345678" });
    assert.deepEqual(extractGuestContact("mail me at guest@example.com thanks"), { email: "guest@example.com" });
  });
  it("captures both when a message holds a phone and an email", () => {
    assert.deepEqual(extractGuestContact("01712345678 or guest@example.com"), {
      phone: "01712345678",
      email: "guest@example.com",
    });
  });
  it("rejects dates, prices, booking codes, and short numbers", () => {
    assert.deepEqual(extractGuestContact("arriving 2026-12-14, thanks"), {});
    assert.deepEqual(extractGuestContact("is it 14500 per night?"), {});
    assert.deepEqual(extractGuestContact("my code is RES-202610-00001"), {});
    assert.deepEqual(extractGuestContact("room 123456 please"), {});
    assert.deepEqual(extractGuestContact("just saying hello"), {});
  });
  it("rejects digit runs glued to letters by dashes", () => {
    assert.deepEqual(extractGuestContact("ref ABC-01712345678 closed"), {});
  });
  it("accepts digits after plain punctuation", () => {
    assert.deepEqual(extractGuestContact("number:01712345678."), { phone: "01712345678" });
  });
});

describe("contact form validation", () => {
  it("accepts either field in form and stores as typed", () => {
    assert.deepEqual(validateContactForm({ phone: "+880 1712-345678", email: "" }), {
      ok: true,
      phone: "+880 1712-345678",
      email: null,
    });
    assert.deepEqual(validateContactForm({ phone: "", email: "guest@example.com" }), {
      ok: true,
      phone: null,
      email: "guest@example.com",
    });
  });
  it("400s when neither field is valid", () => {
    for (const body of [{}, { phone: "", email: "" }, { phone: "abc" }, { phone: "12345" }, { email: "not-an-email" }]) {
      const out = validateContactForm(body);
      assert.equal(out.ok, false, JSON.stringify(body));
    }
  });
  it("saves the valid field and drops the garbage sibling", () => {
    assert.deepEqual(validateContactForm({ phone: "01712345678", email: "oops" }), {
      ok: true,
      phone: "01712345678",
      email: null,
    });
  });
  it("rejects letters and short digit counts in phones", () => {
    assert.equal(cleanContactPhone("call me"), null);
    assert.equal(cleanContactPhone("01712"), null);
    assert.equal(cleanContactPhone(" 01712345678 "), "01712345678");
  });
  it("rejects malformed emails", () => {
    assert.equal(cleanContactEmail("a@b"), null);
    assert.equal(cleanContactEmail("has space@x.com"), null);
    assert.equal(cleanContactEmail(" Guest@Example.com "), "Guest@Example.com");
  });
});

describe("diffGuestContact", () => {
  it("flags new values and keeps stored ones", () => {
    assert.deepEqual(
      diffGuestContact({ guestPhone: null, guestEmail: null }, { phone: "01712345678" }),
      { changed: true, phone: "01712345678", email: null }
    );
  });
  it("treats a retyped value as unchanged (normalized compare)", () => {
    assert.deepEqual(
      diffGuestContact({ guestPhone: "01712345678", guestEmail: null }, { phone: "01712 345678" }),
      { changed: false, phone: "01712345678", email: null }
    );
    assert.deepEqual(
      diffGuestContact({ guestPhone: null, guestEmail: "Guest@Example.com" }, { email: "guest@example.com" }),
      { changed: false, phone: null, email: "Guest@Example.com" }
    );
  });
  it("a second, different number updates the stored value", () => {
    assert.deepEqual(
      diffGuestContact({ guestPhone: "01711111111", guestEmail: null }, { phone: "01712345678" }),
      { changed: true, phone: "01712345678", email: null }
    );
  });
});
