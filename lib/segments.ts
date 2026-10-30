// Suggestion segments: the advice topics an owner enables for their
// chatbot (onboarding + Settings). The agent may suggest ONLY enabled
// segments, and ONLY from verified property information — an enabled
// segment never licenses general-knowledge travel advice. Unknown ids
// are dropped everywhere (API validates, prompt builder filters).

export const SUGGESTION_SEGMENTS = [
  { id: "dining", label: "Dining suggestions", blurb: "Restaurants, resort meals, local food" },
  { id: "transport", label: "Transport suggestions", blurb: "Getting here, getting around" },
  { id: "area-plans", label: "Local area travel plans", blurb: "Day plans incl. transport + tips" },
  { id: "spots", label: "Spot suggestions", blurb: "Nearby places worth visiting" },
  { id: "activities", label: "Activity suggestions", blurb: "Things to do at / near the resort" },
] as const;

export type SuggestionSegmentId = (typeof SUGGESTION_SEGMENTS)[number]["id"];

export function isSegmentId(value: unknown): value is SuggestionSegmentId {
  return (
    typeof value === "string" &&
    (SUGGESTION_SEGMENTS as readonly { id: string }[]).some((s) => s.id === value)
  );
}

export function cleanSegmentIds(value: unknown): SuggestionSegmentId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: SuggestionSegmentId[] = [];
  for (const v of value) {
    if (isSegmentId(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function segmentLabel(id: SuggestionSegmentId): string {
  return SUGGESTION_SEGMENTS.find((s) => s.id === id)?.label ?? id;
}
