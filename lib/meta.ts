// Minimal Meta Model API provider adapter (step 1b: returns usage for logging).
// Talks to Muse Spark via the OpenAI-compatible chat completions endpoint.
// No tool-calling yet — tools arrive in step 2 (AI front-of-house).

const BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
const MODEL = process.env.META_MODEL ?? "muse-spark-1.3";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
};

export async function chatCompletion(
  messages: ChatMessage[]
): Promise<{ reply: string; usage: Usage }> {
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) {
    throw new Error("META_API_KEY is not set");
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    // Generous max_tokens: Muse Spark reasons first and reasoning tokens
    // count against this budget (smoke test: 337 reasoning tokens for one word).
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 1024 }),
  });
  if (!res.ok) {
    throw new Error(`Meta API responded ${res.status}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) {
    throw new Error("Empty reply from model");
  }
  const u = data?.usage ?? {};
  return {
    reply: content,
    usage: {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
    },
  };
}
