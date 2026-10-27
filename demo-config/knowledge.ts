// Seeded property knowledge (step 3). DEMO content only, for the
// hackathon showcase property (Krishnachura Retreat, Himchari,
// Cox's Bazar) — the demo site already badges itself as a demonstration,
// not a real resort.
//
// What belongs here: property facts the tools cannot answer — check-in
// and check-out times, dining, packages, location, getting help.
// What NEVER belongs here: room prices, availability, or booking
// totals. Those come from the Suite tools, and retrieval must never
// override them. If a fact is not in this file, the agent must say it
// does not know and offer a handoff, not guess.
//
// One chunk per document: every document is short enough to embed whole,
// so retrieval returns whole answers, not fragments.

export type KnowledgeDoc = {
  title: string;
  content: string;
};

export const KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  {
    title: "Check-in and check-out",
    content:
      "Check-in at Krishnachura Retreat is from 2:00 PM, and check-out is by 11:00 AM. If you need a different time, ask staff and they will confirm it for you.",
  },
  {
    title: "Dining — halal food",
    content:
      "All food served at Krishnachura Retreat is halal. If you have other dietary needs, ask staff and they will confirm what can be arranged.",
  },
  {
    title: "Family Gathering Week",
    content:
      "Krishnachura Retreat offers a Family Gathering Week package priced at ৳98,000. For what it covers for your group size and dates, ask staff and they will confirm the details.",
  },
  {
    title: "About Krishnachura Retreat",
    content:
      "Krishnachura Retreat is a coastal retreat in Himchari, Cox's Bazar. It is the demonstration property for the Vivereply Concierge showcase.",
  },
  {
    title: "Getting help",
    content:
      "For anything not covered here — a special request, a group booking, or a question the Concierge cannot answer — staff can help. The Concierge will pass the full conversation to staff.",
  },
];
