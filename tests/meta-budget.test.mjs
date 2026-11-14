// Completion budgets (R1.2): default 4096 in both payloads, env-override
// validation, and the empty-reply evidence log line. Fetch stubbed — no
// network, no keys burned. Env is saved/restored. NOTE: the override
// values are read once at module load, so the valid-override end-to-end
// case lives in meta-budget-env.test.mjs (separate process, env set
// before import); here the resolver matrix covers every other branch.
import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { chatCompletion, chatCompletionWithTools, resolveMaxTokens } from "@/lib/meta";

const SAVED = {
  META_API_KEY: process.env.META_API_KEY,
  BASETEN_API_KEY: process.env.BASETEN_API_KEY,
};
const realFetch = globalThis.fetch;
const realError = console.error;
const realWarn = console.warn;

function canned(content, usage = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, ...usage },
    }),
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.warn = realWarn;
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  delete process.env.META_MAX_TOKENS_PLAIN;
  delete process.env.META_MAX_TOKENS_TOOLS;
});

describe("completion budgets (R1.2)", () => {
  it("sends max_tokens 4096 by default in the plain payload", async () => {
    process.env.META_API_KEY = "LLM_primary";
    delete process.env.BASETEN_API_KEY;
    let seen;
    globalThis.fetch = (async (_url, init) => {
      seen = JSON.parse(init.body);
      return canned("hi");
    });
    await chatCompletion([{ role: "user", content: "hi" }]);
    assert.equal(seen.max_tokens, 4096);
  });

  it("sends max_tokens 4096 by default in the tools payload", async () => {
    process.env.META_API_KEY = "LLM_primary";
    delete process.env.BASETEN_API_KEY;
    console.error = () => undefined;
    let seen;
    globalThis.fetch = (async (_url, init) => {
      seen = JSON.parse(init.body);
      return canned(null);
    });
    // No content and no tool calls: throws, but the payload was already sent.
    await assert.rejects(
      chatCompletionWithTools([{ role: "user", content: "hi" }], []),
      /Empty reply from model/
    );
    assert.equal(seen.max_tokens, 4096);
  });

  it("resolves overrides: integer 256–16384 wins, unset/empty/invalid fall back with a warn", () => {
    assert.equal(resolveMaxTokens(undefined, "META_MAX_TOKENS_PLAIN"), 4096);
    assert.equal(resolveMaxTokens("", "META_MAX_TOKENS_PLAIN"), 4096);
    assert.equal(resolveMaxTokens("8192", "META_MAX_TOKENS_PLAIN"), 8192);
    assert.equal(resolveMaxTokens("256", "META_MAX_TOKENS_PLAIN"), 256);
    assert.equal(resolveMaxTokens("16384", "META_MAX_TOKENS_PLAIN"), 16384);
    const warned = [];
    console.warn = (msg) => void warned.push(String(msg));
    assert.equal(resolveMaxTokens("abc", "META_MAX_TOKENS_PLAIN"), 4096);
    assert.equal(resolveMaxTokens("10.5", "META_MAX_TOKENS_PLAIN"), 4096);
    assert.equal(resolveMaxTokens("255", "META_MAX_TOKENS_PLAIN"), 4096);
    assert.equal(resolveMaxTokens("16385", "META_MAX_TOKENS_PLAIN"), 4096);
    assert.equal(warned.length, 4);
    assert.match(warned[0], /META_MAX_TOKENS_PLAIN/);
  });

  it("empty content still throws, and logs finish_reason + usage", async () => {
    process.env.META_API_KEY = "LLM_primary";
    delete process.env.BASETEN_API_KEY;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: {}, finish_reason: "length" }],
        usage: { prompt_tokens: 100, completion_tokens: 4096, completion_tokens_details: { reasoning_tokens: 4000 } },
      }),
    }));
    const logged = [];
    console.error = (msg) => void logged.push(String(msg));
    await assert.rejects(chatCompletion([{ role: "user", content: "hi" }]), /Empty reply from model/);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /finish_reason=length/);
    assert.match(logged[0], /prompt=100, completion=4096, reasoning=4000/);
    assert.match(logged[0], /via=meta/);
  });
});
