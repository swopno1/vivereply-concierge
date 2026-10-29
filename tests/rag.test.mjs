// RAG filter tests: threshold 0.45, top-4, and the silence rule —
// below threshold the agent gets NO grounding (null), never a weak
// guess. Embed + search are injected, so no database is needed.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  RAG_SIMILARITY_THRESHOLD,
  RAG_TOP_K,
  retrieveGrounding,
  toVectorLiteral,
} from "@/lib/rag";

const embed = async () => [0.1, 0.2];

describe("retrieveGrounding", () => {
  it("keeps top-4 at-or-above threshold, formatted as bullets", async () => {
    const search = async () =>
      [0.9, 0.8, 0.7, 0.6, 0.5, 0.45].map((similarity, i) => ({
        title: `T${i}`,
        content: `C${i}`,
        similarity,
      }));
    const { text, chunks } = await retrieveGrounding({ query: "q", embed, search });
    assert.equal(RAG_SIMILARITY_THRESHOLD, 0.45);
    assert.equal(RAG_TOP_K, 4);
    assert.equal(chunks.length, 4);
    assert.ok(chunks.every((c) => c.similarity >= 0.45));
    assert.ok(text.startsWith("- T0: C0"));
  });
  it("returns null text when everything is below threshold", async () => {
    const search = async () => [{ title: "T", content: "C", similarity: 0.44 }];
    const { text, chunks } = await retrieveGrounding({ query: "q", embed, search });
    assert.equal(text, null);
    assert.deepEqual(chunks, []);
  });
  it("returns null text on zero rows", async () => {
    const { text } = await retrieveGrounding({ query: "q", embed, search: async () => [] });
    assert.equal(text, null);
  });
});

describe("toVectorLiteral", () => {
  it("formats finite vectors, rejects the rest", () => {
    assert.equal(toVectorLiteral([1, 2.5]), "[1,2.5]");
    assert.throws(() => toVectorLiteral([]), /Invalid embedding/);
    assert.throws(() => toVectorLiteral([NaN]), /Invalid embedding/);
  });
});
