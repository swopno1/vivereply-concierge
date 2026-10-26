// Minimal Meta Model API provider adapter (step 2a: native tool calling).
// Talks to Muse Spark via the OpenAI-compatible chat completions endpoint.
// Tool calling is native: a standard `tools` array, parallel calls allowed,
// `tool_choice` omitted (defaults to auto — the only value Meta accepts).
// No streaming yet (optional polish).

const BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
const MODEL = process.env.META_MODEL ?? "muse-spark-1.3";

export type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
};

export type ToolCall = {
  id: string;
  name: string;
  args: string; // raw JSON string, parsed by the executor
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
};

function parseUsage(data: { usage?: Record<string, unknown> }): Usage {
  const u = (data.usage ?? {}) as {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

function apiKey(): string {
  const key = process.env.META_API_KEY;
  if (!key) throw new Error("META_API_KEY is not set");
  return key;
}

export async function chatCompletion(
  messages: ChatMessage[]
): Promise<{ reply: string; usage: Usage }> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
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
  return { reply: content, usage: parseUsage(data) };
}

export async function chatCompletionWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[]
): Promise<{ content: string | null; toolCalls: ToolCall[]; usage: Usage }> {
  // Map internal messages to the OpenAI wire shape.
  const wireMessages = messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.toolCalls) {
      return {
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: t.args },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages: wireMessages, tools, max_tokens: 2048 }),
  });
  if (!res.ok) {
    throw new Error(`Meta API responded ${res.status}`);
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) {
    throw new Error("Empty reply from model");
  }
  const toolCalls: ToolCall[] = Array.isArray(message.tool_calls)
    ? message.tool_calls.map(
        (t: { id: string; function?: { name?: string; arguments?: string } }) => ({
          id: t.id,
          name: t.function?.name ?? "",
          args: t.function?.arguments ?? "{}",
        })
      )
    : [];
  const content = typeof message.content === "string" ? message.content : null;
  if (!content && toolCalls.length === 0) {
    throw new Error("Empty reply from model");
  }
  return { content, toolCalls, usage: parseUsage(data) };
}
