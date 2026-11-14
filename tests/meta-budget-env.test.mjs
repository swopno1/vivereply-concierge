// Env-override end-to-end (R1.2): budgets are read once at module load,
// so this file (its own process) sets the env BEFORE importing lib/meta.
// Proves a valid override replaces the default in both payloads.
process.env.META_API_KEY = "LLM_primary";
delete process.env.BASETEN_API_KEY;
process.env.META_MAX_TOKENS_PLAIN = "8192";
process.env.META_MAX_TOKENS_TOOLS = "512";

const { describe, it, afterEach } = await import("node:test");
const { strict: assert } = await import("node:assert");
const { chatCompletion, chatCompletionWithTools } = await import("@/lib/meta");

const realFetch = globalThis.fetch;

function canned(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("completion budget env overrides (R1.2)", () => {
  it("a valid override replaces the default in the plain payload", async () => {
    let seen;
    globalThis.fetch = (async (_url, init) => {
      seen = JSON.parse(init.body);
      return canned("hi");
    });
    await chatCompletion([{ role: "user", content: "hi" }]);
    assert.equal(seen.max_tokens, 8192);
  });

  it("a valid override replaces the default in the tools payload", async () => {
    let seen;
    globalThis.fetch = (async (_url, init) => {
      seen = JSON.parse(init.body);
      return canned("hi");
    });
    await chatCompletionWithTools([{ role: "user", content: "hi" }], []);
    assert.equal(seen.max_tokens, 512);
  });
});
