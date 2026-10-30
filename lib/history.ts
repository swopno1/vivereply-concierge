// History shaping for the model (token budget). The route keeps the
// last 20 messages for context; this caps each message's chars so one
// pasted wall of text can't blow up every later turn. 600 chars holds
// several sentences — recent detail survives, ancient verbosity fades.

export const HISTORY_MESSAGE_CHAR_CAP = 600;

export function capHistoryForModel<T extends { role: string; content: string }>(
  messages: T[]
): Array<T & { role: "assistant" | "user"; content: string }> {
  return messages.map((m) => ({
    ...m,
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content:
      m.content.length > HISTORY_MESSAGE_CHAR_CAP
        ? `${m.content.slice(0, HISTORY_MESSAGE_CHAR_CAP)}…`
        : m.content,
  }));
}
