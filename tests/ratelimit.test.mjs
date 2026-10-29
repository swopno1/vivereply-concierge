// Rate-limit pure-function tests: window bucketing and limit parsing.
// The DB-backed counting (checkChatRate) needs a database and is covered
// by probes against live data, not here.
import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { rateLimitPerMinute, ipRateLimitPerMinute, windowStartOf, RATE_WINDOW_MS } from "@/lib/ratelimit";

const SAVED = process.env.CHAT_RATE_LIMIT_PER_MIN;
const SAVED_IP = process.env.CHAT_RATE_LIMIT_IP_PER_MIN;

afterEach(() => {
  if (SAVED === undefined) delete process.env.CHAT_RATE_LIMIT_PER_MIN;
  else process.env.CHAT_RATE_LIMIT_PER_MIN = SAVED;
  if (SAVED_IP === undefined) delete process.env.CHAT_RATE_LIMIT_IP_PER_MIN;
  else process.env.CHAT_RATE_LIMIT_IP_PER_MIN = SAVED_IP;
});

describe("windowStartOf", () => {
  it("floors to the minute boundary", () => {
    assert.equal(RATE_WINDOW_MS, 60_000);
    assert.equal(windowStartOf(new Date("2026-10-29T12:34:56.789Z")).toISOString(), "2026-10-29T12:34:00.000Z");
    assert.equal(
      windowStartOf(new Date("2026-10-29T12:34:01.000Z")).getTime(),
      windowStartOf(new Date("2026-10-29T12:34:59.999Z")).getTime()
    );
  });
});

describe("rateLimitPerMinute", () => {
  it("defaults to 60, honors env, 0 disables", () => {
    delete process.env.CHAT_RATE_LIMIT_PER_MIN;
    assert.equal(rateLimitPerMinute(), 60);
    process.env.CHAT_RATE_LIMIT_PER_MIN = "10";
    assert.equal(rateLimitPerMinute(), 10);
    process.env.CHAT_RATE_LIMIT_PER_MIN = "0";
    assert.equal(rateLimitPerMinute(), 0);
    process.env.CHAT_RATE_LIMIT_PER_MIN = "nonsense";
    assert.equal(rateLimitPerMinute(), 60);
  });
});

describe("ipRateLimitPerMinute", () => {
  it("defaults to 30, honors env, 0 disables", () => {
    delete process.env.CHAT_RATE_LIMIT_IP_PER_MIN;
    assert.equal(ipRateLimitPerMinute(), 30);
    process.env.CHAT_RATE_LIMIT_IP_PER_MIN = "5";
    assert.equal(ipRateLimitPerMinute(), 5);
    process.env.CHAT_RATE_LIMIT_IP_PER_MIN = "0";
    assert.equal(ipRateLimitPerMinute(), 0);
    process.env.CHAT_RATE_LIMIT_IP_PER_MIN = "nonsense";
    assert.equal(ipRateLimitPerMinute(), 30);
  });
});
