// Fallback tests: the single-Baseten-retry core with fetch stubbed —
// no network, no keys burned. Primary failure + key set serves via
// Baseten (same payload shape, usage tagged); double failure throws
// BOTH errors; no key throws the primary's. Env is saved/restored.
import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { chatCompletion, chatCompletionWithTools } from "@/lib/meta";

const SAVED_META = process.env.META_API_KEY;
const SAVED_BASETEN = process.env.BASETEN_API_KEY;
const realFetch = globalThis.fetch;

function canned(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
  if (SAVED_META === undefined) delete process.env.META_API_KEY;
  else process.env.META_API_KEY = SAVED_META;
  if (SAVED_BASETEN === undefined) delete process.env.BASETEN_API_KEY;
  else process.env.BASETEN_API_KEY = SAVED_BASETEN;
});

describe("completions fallback", () => {
  it("serves via Baseten when the primary throws", async () => {
    process.env.META_API_KEY = "LLM_primary";
    process.env.BASETEN_API_KEY = "baseten-key";
    const urls = [];
    let n = 0;
    globalThis.fetch = (async (url) => {
      urls.push(String(url));
      n += 1;
      if (n === 1) throw new Error("primary down");
      return canned("fallback reply");
    });
    const out = await chatCompletion([{ role: "user", content: "hi" }]);
    assert.equal(out.reply, "fallback reply");
    assert.equal(out.usage.via, "baseten");
    assert.equal(urls.length, 2);
    assert.match(urls[0], /api\.meta\.ai/);
    assert.match(urls[1], /inference\.baseten\.co/);
  });
  it("carries tool calls through the fallback path", async () => {
    process.env.META_API_KEY = "LLM_primary";
    process.env.BASETEN_API_KEY = "baseten-key";
    let n = 0;
    globalThis.fetch = (async () => {
      n += 1;
      if (n === 1) throw new Error("primary down");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [{ id: "c1", function: { name: "get_quote", arguments: "{}" } }],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };
    });
    const out = await chatCompletionWithTools([{ role: "user", content: "price?" }], []);
    assert.equal(out.toolCalls.length, 1);
    assert.equal(out.toolCalls[0].name, "get_quote");
    assert.equal(out.usage.via, "baseten");
  });
  it("throws both errors on double failure, primary's without a key", async () => {
    process.env.META_API_KEY = "LLM_primary";
    process.env.BASETEN_API_KEY = "baseten-key";
    globalThis.fetch = (async () => {
      throw new Error("everything down");
    });
    await assert.rejects(chatCompletion([{ role: "user", content: "hi" }]), /Fallback failed.*primary/);
    delete process.env.BASETEN_API_KEY;
    await assert.rejects(chatCompletion([{ role: "user", content: "hi" }]), /everything down/);
  });
});
