import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { embedMany } from "@/lib/embeddings";

function fakeResponse({ status, retryAfter, values }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(retryAfter == null ? {} : { "Retry-After": retryAfter }),
    json: async () => ({ embeddings: values.map((v) => ({ values: v })) }),
  };
}

const VEC = () => Array(768).fill(0.1);

describe("embedMany retry (R1.1)", () => {
  let realFetch;
  let realKey;
  let calls;
  let sleeps;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    realKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    calls = 0;
    sleeps = [];
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = realKey;
  });

  const sleepMs = async (ms) => void sleeps.push(ms);

  it("retries a 429 then succeeds, waiting ~5s once", async () => {
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1 ? fakeResponse({ status: 429 }) : fakeResponse({ status: 200, values: [VEC()] });
    };
    const out = await embedMany(["hello"], "RETRIEVAL_DOCUMENT", { sleepMs });
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [5000]);
    assert.equal(out.length, 1);
    assert.equal(out[0].length, 768);
  });

  it("does not retry a 400", async () => {
    globalThis.fetch = async () => {
      calls += 1;
      return fakeResponse({ status: 400 });
    };
    await assert.rejects(() => embedMany(["hello"], "RETRIEVAL_DOCUMENT", { sleepMs }), /responded 400/);
    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
  });

  it("gives up after 5 attempts on persistent 503 with 5s/15s/30s/60s waits", async () => {
    globalThis.fetch = async () => {
      calls += 1;
      return fakeResponse({ status: 503 });
    };
    await assert.rejects(() => embedMany(["hello"], "RETRIEVAL_DOCUMENT", { sleepMs }), /responded 503/);
    assert.equal(calls, 5);
    assert.deepEqual(sleeps, [5000, 15000, 30000, 60000]);
  });

  it("honours Retry-After capped at 120s", async () => {
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1 ? fakeResponse({ status: 429, retryAfter: "200" }) : fakeResponse({ status: 200, values: [VEC()] });
    };
    await embedMany(["hello"], "RETRIEVAL_DOCUMENT", { sleepMs });
    assert.deepEqual(sleeps, [120000]);

    calls = 0;
    sleeps = [];
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1 ? fakeResponse({ status: 429, retryAfter: "1" }) : fakeResponse({ status: 200, values: [VEC()] });
    };
    await embedMany(["hello"], "RETRIEVAL_DOCUMENT", { sleepMs });
    assert.deepEqual(sleeps, [5000]);
  });
});
