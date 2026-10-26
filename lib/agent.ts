// Hand-rolled tool-use loop (step 2a). No agent framework: the model
// calls tools, we execute them, we feed results back, until it answers
// in plain text or the turn budget runs out.
//
// Kept free of any Prisma import: the route injects logging + execution,
// so this file typechecks anywhere. Tool-call transcripts are NOT
// persisted across turns — only the assistant's text replies are saved,
// so the model re-derives context from those plus the tool logs' guards.

import {
  chatCompletionWithTools,
  type ChatMessage,
  type ToolDefinition,
  type Usage,
} from "./meta";

export type AgentExecutor = (name: string, argsJson: string) => Promise<unknown>;

export async function runAgent(params: {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  execute: AgentExecutor;
  onModelCall: (usage: Usage) => Promise<void>;
  maxTurns?: number;
}): Promise<{ reply: string }> {
  const { tools, execute, onModelCall, maxTurns = 6 } = params;
  const convo: ChatMessage[] = [...params.messages];

  for (let turn = 0; turn < maxTurns; turn++) {
    const { content, toolCalls, usage } = await chatCompletionWithTools(convo, tools);
    await onModelCall(usage);

    if (toolCalls.length === 0) {
      return { reply: content ?? "I'm sorry, I couldn't prepare a reply. Please try again." };
    }

    convo.push({ role: "assistant", content: content ?? "", toolCalls });
    for (const call of toolCalls) {
      let result: unknown;
      try {
        result = await execute(call.name, call.args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Tool execution failed." };
      }
      convo.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
    }
  }

  return {
    reply:
      "I'm having trouble completing that in one go — please ask me to connect you with our team, and I'll pass along the full conversation.",
  };
}
