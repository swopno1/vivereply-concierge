// Gemini embeddings (step 3). The Meta Model API lists no embedding
// model, so this is an honest hybrid: Muse Spark (Meta) answers, Gemini
// text-embedding-004 (768 dimensions) only turns text into vectors for
// retrieval over our own seeded docs. Embeddings never decide a price,
// availability, or booking — the Suite tools do that.
//
// GEMINI_API_KEY is an embeddings-only key: create it in Google AI
// Studio, put it in .env.local, never commit it, never share it in chat.

const GEMINI_EMBED_MODEL = "text-embedding-004";
const GEMINI_EMBED_DIMENSIONS = 768;

export async function embedText(text: string): Promise<number[]> {
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
