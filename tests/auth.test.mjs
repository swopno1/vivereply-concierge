// Auth pure-function tests: scrypt roundtrip + malformed-hash
// rejection, signed token roundtrip + tamper rejection, and the
// throttle/validator helpers. Token tests set SESSION_SECRET with
// save/restore; nothing here touches the database.
import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  createChatToken,
  createSessionToken,
  generateTempPassword,
  hashPassword,
  isValidEmail,
  isValidSlug,
  throttleDecision,
  verifyChatToken,
  verifyPassword,
  verifySessionToken,
  DUMMY_PASSWORD_HASH,
} from "@/lib/auth";

const SAVED_SECRET = process.env.SESSION_SECRET;

afterEach(() => {
  if (SAVED_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = SAVED_SECRET;
});

describe("passwords (scrypt)", () => {
  it("verifies what it hashes, rejects the rest", async () => {
    const hash = await hashPassword("correct-horse-12");
    assert.match(hash, /^scrypt\$1\$/);
    assert.equal(await verifyPassword("correct-horse-12", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
    assert.equal(await verifyPassword("anything", "not-a-hash"), false);
    assert.equal(await verifyPassword("anything", DUMMY_PASSWORD_HASH), false);
  });
});

describe("session tokens", () => {
  it("roundtrips a valid session, rejects tampering", () => {
    process.env.SESSION_SECRET = "test-secret-32-chars-minimum-ok!";
    const token = createSessionToken({
      sid: "sid1",
      uid: "uid1",
      email: "o@test.com",
      role: "OWNER",
      propertyId: "p1",
    });
    assert.ok(token);
    const back = verifySessionToken(token);
    assert.equal(back?.sid, "sid1");
    assert.equal(back?.propertyId, "p1");
    assert.equal(verifySessionToken(token + "x"), null);
    assert.equal(verifySessionToken(null), null);
  });
  it("refuses owner sessions without a property and sid-less tokens", () => {
    process.env.SESSION_SECRET = "test-secret-32-chars-minimum-ok!";
    assert.equal(createSessionToken({ sid: "", uid: "u", email: null, role: "OWNER", propertyId: "p" }), null);
    const bad = createSessionToken({ sid: "s", uid: "u", email: null, role: "OWNER", propertyId: null });
    assert.equal(bad === null ? null : verifySessionToken(bad), null);
  });
});

describe("chat tokens", () => {
  it("roundtrips widget scope with domain", () => {
    process.env.SESSION_SECRET = "test-secret-32-chars-minimum-ok!";
    const token = createChatToken({ propertyId: "p1", scope: "widget", domain: "demo1.test" });
    assert.ok(token);
    const back = verifyChatToken(token);
    assert.equal(back?.scope, "widget");
    assert.equal(back?.domain, "demo1.test");
    assert.equal(verifyChatToken("garbage"), null);
  });
});

describe("helpers", () => {
  it("throttles past either ceiling", () => {
    assert.equal(throttleDecision(0, 0), false);
    assert.equal(throttleDecision(5, 0), true);
    assert.equal(throttleDecision(0, 20), true);
  });
  it("validates slugs and emails", () => {
    assert.equal(isValidSlug("krishnachura-retreat"), true);
    assert.equal(isValidSlug("has space"), false);
    assert.equal(isValidEmail("o@test.com"), true);
    assert.equal(isValidEmail("nope"), false);
  });
  it("mints readable temp passwords", () => {
    const p = generateTempPassword();
    assert.equal(typeof p, "string");
    assert.ok(p.length >= 12);
  });
});
