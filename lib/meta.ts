// Minimal Meta Model API provider adapter (step 2a: native tool calling).
// Talks to Muse Spark via the OpenAI-compatible chat completions endpoint.
// Tool calling is native: a standard `tools` array, parallel calls allowed,
// `tool_choice` omitted (defaults to auto — the only value Meta accepts).
// No streaming yet (optional polish).
//
// Baseten fallback (hackathon demo insurance): when the primary Meta API
// call fails AND BASETEN_API_KEY is set, the same payload retries once
// against Baseten's OpenAI-compatible endpoint serving Meta's open-weights
// model (exactly meta-models/muse-spark-open-1026 — the key works with no
// other model). Without the key the fallback is inert and behavior is
// identical to before. Every fallback serve is logged (server log only),
// and fallback replies may word things slightly differently — same tools,
// same guards, different weights. Data-flow note: on fallback turns, guest
// text flows to Baseten instead of Meta (stated in the README, never
// silent). Only the two models below ever serve guest turns — in
// particular no `-contributor` model variant ever touches guest data,
// on either backend (no such name appears in any guest-path code).

const BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
// Free text, deliberately not an allowlist: this is founder-only server
// config (no guest input can reach it), and pinning names would block
// same-day model upgrades. The safety is procedural: changing it
// requires a full eval re-run (docs/model-version.md) before deploy.
const MODEL = process.env.META_MODEL ?? "muse-spark-1.3";
const BASETEN_URL = "https://inference.baseten.co/v1";
// Pinned, deliberately not an env override: the hackathon key works ONLY
// with this exact model, so configurability would be a pure footgun.
const BASETEN_MODEL = "meta-models/muse-spark-open-1026";

// Sampling knob (optimization backlog #1): optional META_TEMPERATURE (0-2).
// Unset = API default = today's behavior, byte-identical. Set = the same
// temperature on every completion, tool and plain, primary and fallback.
// Validated once at module load; an invalid value warns and behaves as
// unset, so a typo can never silently reshape answers.
const FIXED_TEMPERATURE: number | null = (() => {
  const raw = process.env.META_TEMPERATURE;
  if (raw === undefined || raw === "") return null;
  const t = Number(raw);
  if (!Number.isFinite(t) || t < 0 || t > 2) {
    console.warn(`concierge: ignoring invalid META_TEMPERATURE=${JSON.stringify(raw)} (want 0-2)`);
    return null;
  }
  return t;
})();

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

export type LlmBackend = "meta" | "baseten";

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  // Which backend served this call — persisted on the model_call log
  // row so the fallback rate is a DB query, not a log-grep.
  via: LlmBackend;
};

function parseUsage(data: { usage?: Record<string, unknown> }, via: LlmBackend): Usage {
  const u = (data.usage ?? {}) as {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
    via,
  };
}

function apiKey(): string {
  const key = process.env.META_API_KEY;
  if (!key) throw new Error("META_API_KEY is not set");
  return key;
}

function basetenKey(): string | null {
  return process.env.BASETEN_API_KEY ?? null;
}

// One completions attempt against one backend. Throws on transport, status,
// or shape failure — the caller decides whether a fallback attempt follows.
// Bounded at 60s per attempt: a hung provider must fail the turn (and
// trigger the single Baseten fallback), never hang the guest's request
// until the serverless function itself dies. 60s, not the Suite's 15s,
// because reasoning models legitimately take longer than a booking API.
const COMPLETIONS_TIMEOUT_MS = 60_000;

async function attemptCompletions(
  baseUrl: string,
  key: string,
  model: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, model }),
      signal: AbortSignal.timeout(COMPLETIONS_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === "TimeoutError"
        ? `Completions API timed out after ${COMPLETIONS_TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : "Completions API request failed"
    );
  }
  if (!res.ok) {
    throw new Error(`Completions API responded ${res.status}`);
  }
  return res.json();
}

// Primary then fallback: the Meta API first, always; Baseten's
// open-weights endpoint second, only when its key is configured. Exactly
// one fallback attempt — a double failure throws the FALLBACK's error with
// the primary's attached, so the log shows both. A primary 429 falls
// back too, deliberately: Baseten is a DIFFERENT provider with its own
// quota, so this sheds load sideways instead of hammering Meta again —
// and the fallback never retries, so the worst case is 2 calls, not a storm.
async function completionsWithFallback(payload: Record<string, unknown>): Promise<{ data: unknown; via: "meta" | "baseten" }> {
  const effective =
    FIXED_TEMPERATURE === null ? payload : { ...payload, temperature: FIXED_TEMPERATURE };
  try {
    const data = await attemptCompletions(BASE_URL, apiKey(), MODEL, effective);
    return { data, via: "meta" };
  } catch (primaryError) {
    const fallbackKey = basetenKey();
    if (!fallbackKey) throw primaryError;
    try {
      const data = await attemptCompletions(BASETEN_URL, fallbackKey, BASETEN_MODEL, effective);
      console.log(
        `concierge: llm fallback baseten (primary: ${primaryError instanceof Error ? primaryError.message : primaryError})`
      );
      return { data, via: "baseten" };
    } catch (fallbackError) {
      throw new Error(
        `Fallback failed (${fallbackError instanceof Error ? fallbackError.message : fallbackError}); primary: ${primaryError instanceof Error ? primaryError.message : primaryError}`
      );
    }
  }
}

export async function chatCompletion(
  messages: ChatMessage[]
): Promise<{ reply: string; usage: Usage }> {
  // Generous max_tokens: Muse Spark reasons first and reasoning tokens
  // count against this budget (smoke test: 337 reasoning tokens for one word).
  const { data, via } = await completionsWithFallback({ messages, max_tokens: 1024 });
  const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) {
    throw new Error("Empty reply from model");
  }
  return { reply: content, usage: parseUsage(data as { usage?: Record<string, unknown> }, via) };
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

  const { data, via } = await completionsWithFallback({ messages: wireMessages, tools, max_tokens: 2048 });
  const message = (data as { choices?: { message?: unknown }[] })?.choices?.[0]?.message as
    | { content?: unknown; tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[] }
    | undefined;
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
  return { content, toolCalls, usage: parseUsage(data as { usage?: Record<string, unknown> }, via) };
}
