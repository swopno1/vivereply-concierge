// Brand knowledge (owner-chat brand mode). A static, curated corpus —
// NOT the tenant KnowledgeDocument pipeline, deliberately:
//   - KnowledgeDocument requires a Property FK row; brand knowledge is
//     global and must work with an EMPTY database (the no-property
//     bootstrap case this mode exists for).
//   - The corpus is ~8 entries: keyword retrieval is deterministic and
//     auditable where vectors would be overkill with failure modes.
//   - Nothing here ever touches tenant tables: brand turns are fully
//     stateless (no conversations, no logs, no budget rows).
// Every factual sentence below was verified against a live source on
// 2026-11-12 (see sourceUrl per entry) or is marked founder-provided.
// Guards live in tests/brand-knowledge.test.mjs: no fee figures, no
// "MCP", every entry cited, acceptance questions mapped.

export type BrandEntry = {
  id: string;
  title: string;
  sourceLabel: string;
  sourceUrl: string;
  keywords: string[];
  body: string;
};

// Bodies are paraphrases of the cited pages, kept close to the source
// wording so drift is easy to spot on re-verification.
export const BRAND_ENTRIES: BrandEntry[] = [
  {
    id: "vivereply-overview",
    title: "What is ViveReply",
    sourceLabel: "ViveReply homepage",
    sourceUrl: "https://www.vivereply.com/",
    keywords: ["vivereply", "company", "about", "products", "ecosystem", "software company"],
    body: [
      "ViveReply builds B2B software for businesses: the hospitality vertical is ViveReply Suite — a deployable, client-owned scaffold, custom-fitted per resort on its own domain — and the communication horizontal is the ViveReply Chatbot, an AI front-office assistant.",
      "The products work independently or together: connected, the Chatbot reads live data from Suite so guests, staff, and the AI share the same numbers.",
    ].join(" "),
  },
  {
    id: "suite-overview",
    title: "ViveReply Suite (Resort PMS)",
    sourceLabel: "ViveReply Suite page",
    sourceUrl: "https://www.vivereply.com/suite",
    keywords: [
      "suite", "pms", "resort pms", "property management", "booking website",
      "direct booking", "management system", "front desk", "housekeeping",
      "resort system", "booking engine", "reservation", "pms system", "vivereply",
    ],
    body: [
      "ViveReply Suite is a Resort Property Management System (Resort PMS): a complete platform for direct bookings, guest websites, and daily hospitality operations.",
      "Guests get a branded website on a custom domain, bilingual Bengali/English browsing, a live availability calendar, online direct booking, and deposit payment via bKash, Nagad, SSLCommerz and BanglaQR.",
      "Staff get a management dashboard, central reservation ledger, front-desk check-in and check-out, room inventory with blocked dates, housekeeping clean/dirty status, and occupancy reporting.",
      "Each resort gets a custom, isolated deployment.",
    ].join(" "),
  },
  {
    id: "chatbot-overview",
    title: "Vivereply Chatbot (AI front-office assistant)",
    sourceLabel: "ViveReply Chatbot page",
    sourceUrl: "https://www.vivereply.com/chatbot",
    keywords: [
      "chatbot", "concierge", "ai assistant", "front office", "front-office",
      "front desk agent", "quotes", "exact prices", "booking", "booking drafts",
      "draft codes", "staff handoff", "verification", "bengali", "english",
      "availability", "live availability", "vivereply",
    ],
    body: [
      "Vivereply Chatbot is an AI front-office assistant for resorts and hotels: it answers guest questions, checks live availability, quotes exact prices, holds booking drafts with real codes, verifies bookings privately, and hands complex cases to staff with the full transcript — in English and Bengali.",
      "Every price and availability answer comes from a live check at the moment of asking; it never guesses. Verification by code shows dates, first name and status only; email or phone lookups email details to the stored address instead of revealing them in chat.",
      "It reads live rates from the booking backend, including Suite. It is currently the Concierge hackathon MVP; general availability follows.",
    ].join(" "),
  },
  {
    id: "chatbot-suite-together",
    title: "Using Chatbot with Suite",
    sourceLabel: "ViveReply Chatbot page (Works with Suite)",
    sourceUrl: "https://www.vivereply.com/chatbot",
    keywords: ["integrate", "integration", "together", "connect suite", "same data", "work together", "combine", "connected"],
    body: "Chatbot and Suite share one data source: the Chatbot reads live availability and rates from the booking backend, so the website, the PMS and the chatbot work from the same real numbers. Products can be adopted independently and connected later.",
  },
  {
    id: "onboarding",
    title: "Onboarding a resort",
    sourceLabel: "Owner guide (docs/owner-guide.md) + Docs: Connecting a Property",
    sourceUrl: "https://www.vivereply.com/docs/chatbot/setup",
    keywords: [
      "onboarding", "onboard", "setup", "getting started", "install", "embed",
      "connect", "widget install", "how to start", "knowledge upload",
      "domain approval", "sign up a resort", "get started",
    ],
    body: [
      "Onboarding runs: 1) Sign up with resort name, work email and password, then verify via the inbox link. 2) Teach it the resort: business form plus the website address and documents such as rate card, policies and menus — one ingestion run per resort. 3) Connect bookings: Suite base URL plus key (Test must go green), then a room catalogue row per sellable room with live prices. 4) Put it on the website: approve each domain, paste the script tag before </body>.",
      "From the connection checklist: the widget needs an approved-domain row (the most common setup failure), catalogue rows must point at the right Suite room IDs, and the Suite ping contract must answer.",
    ].join(" "),
  },
  {
    id: "roomready",
    title: "RoomReady",
    // FOUNDER-PROVIDED 2026-11-12: RoomReady appears in no public source
    // checked (marketing site ×12 pages, docs site incl. housekeeping +
    // setup + glossary + roadmap, owner guide, docs repo, blog). Keep
    // this entry minimal until it is published somewhere citable.
    sourceLabel: "Founder handover 2026-11-12 (unpublished — confirm before quoting externally)",
    sourceUrl: "https://vivereply.com/contact",
    keywords: ["roomready", "room ready", "housekeeping add-on", "housekeeping addon"],
    body: "RoomReady is a housekeeping add-on for ViveReply Suite — not a standalone product. It is not covered in the published docs yet; for details, contact us and we will walk you through it.",
  },
  {
    id: "payments",
    title: "Payments (guest money flow)",
    sourceLabel: "ViveReply Suite page + Owner guide",
    sourceUrl: "https://www.vivereply.com/suite",
    keywords: ["payment", "payments", "pay", "bkash", "nagad", "sslcommerz", "banglaqr", "deposit", "gateway", "pay page"],
    body: [
      "Suite takes deposits through bKash, Nagad, SSLCommerz and BanglaQR on the resort's own branded pay page.",
      "The Chatbot presses held drafts toward that page and mints the payment link itself; card payments confirm automatically while manual transfers wait for staff confirmation.",
      "Guest money goes to the resort's own accounts — never through ViveReply.",
    ].join(" "),
  },
  {
    id: "support-contact",
    title: "Talk to us",
    sourceLabel: "ViveReply homepage (Contact + Docs links)",
    sourceUrl: "https://vivereply.com/contact",
    keywords: ["contact", "support", "help", "human", "talk to", "trial access", "request trial", "email us", "demo request", "get in touch"],
    body: "Talk to us through the contact page (https://vivereply.com/contact) — including trial-access requests — or read the docs at https://vivereply.com/docs.",
  },
];

// Greeting detection: leading greeting tokens (EN + BN, mirrored from
// the chat route's trivial-turn list). Stripped first: a bare greeting
// gets the greeting template, while "hello, what is the suite?" routes
// the remainder normally.
const GREETING_TOKENS = new Set([
  "hi", "hey", "hello", "yo", "morning", "afternoon", "evening",
  "হাই", "হ্যালো", "নমস্কার", "আসসালামু", "আদাব",
]);

// Pricing intent (order matters — checked before booking intent).
const PRICING_WORDS = /\b(price|prices|pricing|cost|costs|how much|fee|fees|charge|subscription|plan|plans|trial)\b/i;
const SUITE_WORDS = /\b(suite|pms)\b/i;
const CHATBOT_WORDS = /\b(chatbot|concierge|bot)\b/i;
const ROOM_WORDS = /\b(room|rooms|stay|night|nights|guest|suite-room)\b/i;

// Booking intent: action requests, not feature questions. A leading
// question frame ("how/why/does…") means the asker wants to know ABOUT
// booking, so it skips deflection and goes to retrieval instead.
const BOOKING_WORDS = /\b(book|booking|bookings|booked|reserve|reservation|reserving|availability|available|vacancy|check[ -]?in)\b/i;
const FEATURE_FRAME = /^(how|what|why|does|do|is|are|tell me|explain)\b/i;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function stripGreeting(text: string): { remainder: string; wasOnlyGreeting: boolean } {
  const words = tokenize(text);
  let i = 0;
  // "good morning" style pairs collapse to one greeting token span.
  while (i < words.length && (GREETING_TOKENS.has(words[i]) || words[i] === "good")) i += 1;
  const remainder = words.slice(i).join(" ");
  return { remainder, wasOnlyGreeting: i > 0 && remainder.length === 0 };
}

function scoreEntry(words: Set<string>, entry: BrandEntry): number {
  let score = 0;
  for (const kw of entry.keywords) {
    const parts = kw.toLowerCase().split(/\s+/);
    if (parts.length > 1) {
      if (parts.every((w) => words.has(w))) score += 3;
    } else if (words.has(parts[0])) {
      score += 1;
    }
  }
  return score;
}

export type BrandAnswer = { reply: string; path: string; entryId: string | null };

const tag = (detail: string) => `\n\n— Brand assistant · ${detail}`;

const GREETING_REPLY =
  "Hello! I'm the ViveReply brand assistant — I answer questions about ViveReply's products (Suite, Chatbot, onboarding, RoomReady, payments) from our official site and docs. " +
  "I have no resort data here: no bookings, availability, or room prices. " +
  "Try asking: What is ViveReply Suite?";

const BOOKING_DEFLECT =
  "I don't have booking data here — this chat knows ViveReply's products, not any resort's rooms, rates, or availability. " +
  "For bookings, please use the resort's own chatbot or contact their staff directly.";

const SUITE_PRICING_DEFLECT =
  "Suite project pricing isn't public — every deployment is custom-scoped. Talk to us and we'll work it out: https://vivereply.com/contact";

const CHATBOT_PRICING_DEFLECT =
  "The Chatbot starts with a 30-day free trial, then a subscription — details on request: https://vivereply.com/contact";

const BARE_PRICING_DEFLECT =
  "For room prices I have no resort data here — please use the resort's own chatbot. " +
  "For Suite project pricing, talk to us: https://vivereply.com/contact — " +
  "and the Chatbot starts with a 30-day free trial, then a subscription, details on request.";

const UNKNOWN_FALLBACK =
  "I don't have that in my sources (the ViveReply site, docs, and owner guide). " +
  "I answer questions about Suite, the Chatbot, onboarding, RoomReady, and payments. " +
  "For anything else, contact us: https://vivereply.com/contact";

export function answerBrand(message: string): BrandAnswer {
  const { remainder, wasOnlyGreeting } = stripGreeting(message);
  if (wasOnlyGreeting) {
    return { reply: GREETING_REPLY + tag("greeting"), path: "greeting", entryId: null };
  }
  const text = remainder || message;

  if (PRICING_WORDS.test(text)) {
    if (SUITE_WORDS.test(text)) {
      return { reply: SUITE_PRICING_DEFLECT + tag("Suite pricing (no figures quoted)"), path: "pricing-suite", entryId: null };
    }
    if (ROOM_WORDS.test(text)) {
      return { reply: BOOKING_DEFLECT + tag("booking deflection (no resort data)"), path: "booking", entryId: null };
    }
    if (CHATBOT_WORDS.test(text) || /\btrial\b/i.test(text)) {
      return { reply: CHATBOT_PRICING_DEFLECT + tag("Chatbot pricing (no figures quoted)"), path: "pricing-chatbot", entryId: null };
    }
    return { reply: BARE_PRICING_DEFLECT + tag("pricing (no figures quoted)"), path: "pricing-bare", entryId: null };
  }

  const framed = FEATURE_FRAME.test(text.trim());
  if (!framed && BOOKING_WORDS.test(text)) {
    return { reply: BOOKING_DEFLECT + tag("booking deflection (no resort data)"), path: "booking", entryId: null };
  }

  const words = new Set(tokenize(text));
  let best: BrandEntry | null = null;
  let bestScore = 0;
  for (const entry of BRAND_ENTRIES) {
    const score = scoreEntry(words, entry);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (best && bestScore > 0) {
    return {
      reply: `${best.body}\n\nSources: ${best.sourceLabel} — ${best.sourceUrl}` + tag("brand knowledge"),
      path: "retrieval",
      entryId: best.id,
    };
  }
  return { reply: UNKNOWN_FALLBACK + tag("no matching source"), path: "unknown", entryId: null };
}

export const BRAND_GREETING =
  "Hello! I'm the ViveReply brand assistant. Ask me about Suite, the Chatbot, onboarding, RoomReady, or payments.";

export const BRAND_SUGGESTIONS = [
  "What is ViveReply Suite?",
  "What does the Chatbot do?",
  "How does onboarding work?",
];
