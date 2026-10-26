// Conversation language detection (step 2a).
// Bengali Unicode range -> "bn", everything else -> "en". The guest can
// also switch explicitly ("reply in Bengali"), which the agent honors by
// conversation language, not by re-detecting every turn.

const BENGALI_RE = /[\u0980-\u09FF]/;

export type ConversationLanguage = "en" | "bn";

export function detectLanguage(text: string): ConversationLanguage {
  return BENGALI_RE.test(text) ? "bn" : "en";
}
