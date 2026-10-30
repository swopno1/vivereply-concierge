// Retrieval over seeded property knowledge (step 3, supporting only —
// never the headline: a "basic RAG app" is on the hackathon anti-list,
// and this layer only grounds answers the agent tools cannot give).
// Kept free of any Prisma import: the route injects the search, so this
// file typechecks anywhere.
//
// Rules, from the architecture decision:
// - Corpus = seeded demo1 knowledge only (demo-config/knowledge.ts).
// - Similarity = 1 - cosine distance (pgvector <=>), threshold 0.45,
//   top 4. Below threshold the agent gets NO grounding and must say it
//   does not know, then offer a handoff — never invent.
// - Room prices and availability are NEVER knowledge docs; the Suite
//   tools govern those, and retrieval must never override them.

export type RagChunk = {
  title: string;
  content: string;
  similarity: number;
};

export type RagSearch = (embedding: number[]) => Promise<RagChunk[]>;

export const RAG_SIMILARITY_THRESHOLD = 0.45;
export const RAG_TOP_K = 4;
// Token budget: chunks are 2000-char windows on disk, but the model only
// ever needs the head — the match that cleared 0.45 sits at the front.
// 600 chars x 4 chunks bounds grounding at ~2.4k chars (~600 tokens)
// instead of ~8k chars (~2k tokens).
export const RAG_CHUNK_CHAR_CAP = 600;

export function toVectorLiteral(embedding: number[]): string {
  if (embedding.length === 0 || !embedding.every((n) => Number.isFinite(n))) {
    throw new Error("Invalid embedding: expected finite numbers");
  }
  return `[${embedding.join(",")}]`;
}

export async function retrieveGrounding(params: {
  query: string;
  embed: (text: string) => Promise<number[]>;
  search: RagSearch;
}): Promise<{ text: string | null; chunks: RagChunk[] }> {
  const embedding = await params.embed(params.query);
  const rows = await params.search(embedding);
  const chunks = rows
    .filter((r) => r.similarity >= RAG_SIMILARITY_THRESHOLD)
    .slice(0, RAG_TOP_K);
  if (chunks.length === 0) {
    return { text: null, chunks: [] };
  }
  const text = chunks
    .map((c) => {
      const head =
        c.content.length > RAG_CHUNK_CHAR_CAP
          ? `${c.content.slice(0, RAG_CHUNK_CHAR_CAP)}…`
          : c.content;
      return `- ${c.title}: ${head}`;
    })
    .join("\n");
  return { text, chunks };
}
