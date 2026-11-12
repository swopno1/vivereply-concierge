// History shaping for the model (token budget). The route keeps the
// last 20 messages for context; this caps each message's chars so one
// pasted wall of text can't blow up every later turn. 600 chars holds
// several sentences — recent detail survives, ancient verbosity fades.
//
// Role mapping (staff continuity): user and assistant pass through;
// staff rides as assistant with a staff prefix (a person's words must
// never reach the model as the guest's own); system lines are dropped
// entirely (join/holding/return notices are guest chrome, not context).

export const HISTORY_MESSAGE_CHAR_CAP = 600;

export function staffHistoryPrefix(author: string | null | undefined): string {
  const name = typeof author === "string" && author.trim() ? author.trim() : "Unknown";
  return `[Resort staff member ${name}]: `;
}

export function capHistoryForModel<T extends { role: string; content: string; author?: string | null }>(
  messages: T[]
): Array<T & { role: "assistant" | "user"; content: string }> {
  const out: Array<T & { role: "assistant" | "user"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "user" ? ("user" as const) : ("assistant" as const);
    const text = m.role === "staff" ? `${staffHistoryPrefix(m.author)}${m.content}` : m.content;
    out.push({
      ...m,
      role,
      content:
        text.length > HISTORY_MESSAGE_CHAR_CAP ? `${text.slice(0, HISTORY_MESSAGE_CHAR_CAP)}…` : text,
    });
  }
  return out;
}
