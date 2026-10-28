// Gemini embeddings (step 3). The Meta Model API lists no embedding
// model, so this is an honest hybrid: Muse Spark (Meta) answers, Gemini
// only turns text into vectors for retrieval over our own seeded docs.
// Embeddings never decide a price, availability, or booking — the
// Suite tools do that.
//
// Model note (step 3 fix, 2026-10-27): text-embedding-004 was retired
// from the v1beta path in Feb 2026 (its calls now 404); Google's
// replacement is gemini-embedding-001, same API version. Its native
// size is 3072 dimensions, so we request outputDimensionality 768 for
// both documents and queries — the pgvector schema stays vector(768)
// and no db push is needed for this fix.
//
// GEMINI_API_KEY is an embeddings-only key: create it in Google AI
// Studio, put it in .env.local, never commit it, never share it in chat.

const GEMINI_EMBED_MODEL = "gemini-embedding-001";
const GEMINI_EMBED_DIMENSIONS = 768;

export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedText(
  text: string,
  taskType: EmbedTaskType = "RETRIEVAL_QUERY"
): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: GEMINI_EMBED_DIMENSIONS,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini embeddings responded ${res.status}`);
  }
  const data = await res.json();
  const values = data?.embedding?.values;
  if (
    !Array.isArray(values) ||
    values.length !== GEMINI_EMBED_DIMENSIONS ||
    !values.every((n: unknown) => typeof n === "number" && Number.isFinite(n))
  ) {
    throw new Error("Unexpected Gemini embedding response (expected 768 numbers)");
  }
  return values as number[];
}

// Batch embeddings for ingestion (onboarding callback). One HTTP call per
// 100 texts; order preserved. Same model, same 768 dimensions, document
// task type — queries keep using embedText above.
export async function embedMany(
  texts: string[],
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${GEMINI_EMBED_MODEL}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: GEMINI_EMBED_DIMENSIONS,
          })),
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini batch embeddings responded ${res.status}`);
    }
    const data = await res.json();
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
      throw new Error("Unexpected Gemini batch response (count mismatch)");
    }
    for (const item of embeddings) {
      const values = item?.values;
      if (
        !Array.isArray(values) ||
        values.length !== GEMINI_EMBED_DIMENSIONS ||
        !values.every((n: unknown) => typeof n === "number" && Number.isFinite(n))
      ) {
        throw new Error("Unexpected Gemini batch response (expected 768 numbers each)");
      }
      out.push(values as number[]);
    }
  }
  return out;
}
