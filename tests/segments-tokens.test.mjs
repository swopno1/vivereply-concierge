// Segments + token-budget tests: segment ids validate, the prompt gates
// advice topics grounded-only, RAG chunks and history messages are char-
// capped, and the system prompt stays inside its token budget.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { cleanSegmentIds, isSegmentId, SUGGESTION_SEGMENTS } from "@/lib/segments";
import { systemPrompt, PROMPT_VERSION } from "@/lib/prompts";
import { retrieveGrounding, RAG_CHUNK_CHAR_CAP } from "@/lib/rag";
import { capHistoryForModel, HISTORY_MESSAGE_CHAR_CAP } from "@/lib/history";

describe("segments", () => {
  it("catalog holds the five owner-facing topics", () => {
    assert.deepEqual(
      SUGGESTION_SEGMENTS.map((s) => s.id),
      ["dining", "transport", "area-plans", "spots", "activities"]
    );
  });
  it("drops unknown ids, dedupes, rejects non-arrays", () => {
    assert.deepEqual(cleanSegmentIds(["dining", "nope", "dining", 7]), ["dining"]);
    assert.deepEqual(cleanSegmentIds("dining"), []);
    assert.deepEqual(cleanSegmentIds(null), []);
    assert.equal(isSegmentId("spots"), true);
    assert.equal(isSegmentId(""), false);
  });
  it("prompt lists enabled segments as grounded-only", () => {
    const p = systemPrompt("en", null, undefined, {
      assistantName: "Aria",
      suggestionSegments: ["dining", "spots"],
    });
    assert.match(p, /answer as Aria/);
    assert.match(p, /ONLY these topics.*dining, spots/);
    assert.match(p, /never general knowledge/);
  });
  it("prompt with no segments refuses advice topics", () => {
    const p = systemPrompt("en", null, undefined, { assistantName: "Aria", suggestionSegments: [] });
    assert.match(p, /Offer no travel\/dining\/transport advice/);
  });
  it("prompt version bumped for the segments change", () => {
    assert.equal(PROMPT_VERSION, 7);
  });
});

describe("token budgets", () => {
  it("truncates long RAG chunks, keeps short ones whole", async () => {
    const long = "x".repeat(2000);
    const { text } = await retrieveGrounding({
      query: "q",
      embed: async () => [0.1],
      search: async () => [
        { title: "Long", content: long, similarity: 0.9 },
        { title: "Short", content: "abc", similarity: 0.9 },
      ],
    });
    assert.ok(text.includes("Short: abc"));
    assert.ok(!text.includes(long));
    assert.ok(text.length < 2 * RAG_CHUNK_CHAR_CAP + 100);
  });
  it("caps history messages, keeps roles mapped", () => {
    const out = capHistoryForModel([
      { role: "user", content: "hi" },
      { role: "assistant", content: "y".repeat(2000) },
    ]);
    assert.equal(out[0].content, "hi");
    assert.equal(out[1].role, "assistant");
    assert.equal(out[1].content.length, HISTORY_MESSAGE_CHAR_CAP + 1);
  });
  it("system prompt stays inside budget worst-case", async () => {
    const { text } = await retrieveGrounding({
      query: "q",
      embed: async () => [0.1],
      search: async () =>
        [1, 2, 3, 4].map((i) => ({ title: `D${i}`, content: "z".repeat(2000), similarity: 0.9 })),
    });
    const full = systemPrompt("en", text, undefined, {
      assistantName: "Aria",
      suggestionSegments: ["dining", "transport", "area-plans", "spots", "activities"],
    });
    // ~4 chars/token: grounded system prompt must stay under ~1800 tokens.
    assert.ok(full.length < 7200, `system prompt ${full.length} chars over budget`);
  });
});
