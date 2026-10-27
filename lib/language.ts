// Conversation language detection (step 2a, language fix 2026-10-27).
//
// Bug it fixes: the old detector treated ANY character in the Bengali
// Unicode block (U+0980-U+09FF) as Bengali — including the taka sign
// ৳ (U+09F3). An English message like "budget around ৳15,000" therefore
// flipped the whole conversation to Bengali, and the route only ever
// latched en -> bn, never back, so that conversation stayed Bengali.
//
// New rule: only Bengali LETTERS count. Currency signs (৳), Bengali or
// Latin digits, and punctuation are neutral. A message with no letters
// at all (a date, a price, "৳15,000" alone) returns null: the route
// leaves the conversation language unchanged. An explicit
// "reply in Bengali/English" request wins over letter detection, so a
// guest can always switch on purpose.

const BENGALI_LETTER_RE = /[\u0985-\u09B9\u09BE-\u09CC\u09DC-\u09DF\u09E0-\u09E3]/;
const LATIN_LETTER_RE = /[A-Za-z]/;
const SWITCH_TO_BN_RE = /\b(reply|answer|speak|talk|switch to) (in |using )?(bengali|bangla)\b/i;
const SWITCH_TO_EN_RE = /\b(reply|answer|speak|talk|switch to) (in |using )?english\b/i;

export type ConversationLanguage = "en" | "bn";

export function detectLanguage(text: string): ConversationLanguage | null {
  if (SWITCH_TO_BN_RE.test(text)) return "bn";
  if (SWITCH_TO_EN_RE.test(text)) return "en";
  if (BENGALI_LETTER_RE.test(text)) return "bn";
  if (LATIN_LETTER_RE.test(text)) return "en";
  return null;
}
