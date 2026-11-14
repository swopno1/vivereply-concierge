// Lane A platform corpus, curated part (Handover R1): business details,
// troubleshooting entries, and subscription help. Docs pages arrive via
// the ingestion script; these entries ship in code and seed through the
// same job. Hygiene: user-facing text only — no internal labels, no
// "hackathon MVP" framing (pinned by tests/assistant-corpus.test.mjs).

export type CorpusGroup = "business" | "troubleshooting" | "subscription";

export interface CuratedEntry {
  id: string;
  group: CorpusGroup;
  title: string;
  body: string;
  /** Docs page backing this entry, when one exists (full URL for citations). */
  docsUrl?: string;
}

const DOCS = "https://www.vivereply.com/docs";

export const CURATED_ENTRIES: CuratedEntry[] = [
  {
    id: "business-identity",
    group: "business",
    title: "About ViveReply",
    body: [
      "ViveReply is built by ViveScript Solutions LLC, 1621 Central Ave, Cheyenne, WY 82001.",
      "Products: the AI Chatbot for resort websites (live), the Suite property system with booking and front-desk tools (live), and RoomReady room-readiness tracking (coming soon).",
      "Contact: WhatsApp +8801819062270, support@vivereply.com for help, info@vivereply.com for general enquiries. Guides live at https://www.vivereply.com/docs and inside the app under Support.",
    ].join("\n\n"),
  },
  {
    id: "business-trial",
    group: "business",
    title: "Trial and subscription basics",
    body: [
      "Every property starts with a 30-day free trial of the chatbot with full Growth features and no card required.",
      "A conversation is one guest chat thread opened in a calendar month. Each plan includes a monthly conversation quota, shown with your live usage on the Usage page and the dashboard Home.",
      "When the trial ends without a subscription, guest chat pauses; your configuration, rooms, and history are kept, and subscribing resumes immediately.",
    ].join("\n\n"),
  },
  {
    id: "troubleshooting-secret-mismatch",
    group: "troubleshooting",
    title: "Booking system secret mismatch",
    body: [
      "Symptoms: Test connection fails with an authentication error even though the Suite address is correct, or quotes suddenly stop working after a key change.",
      "Checks in order: 1) Open Chatbot → Booking system and confirm the Suite base URL matches the Suite deployment exactly (no trailing slash surprises). 2) Confirm which secret you pasted: the Suite binding needs the booking-system shared secret (CONCIERGE_SHARED_SECRET on the Suite side), NOT a staff bridge key (cb.…). The two are different credentials for different directions. 3) Re-save the binding with the correct secret.",
      "Fix: paste the shared secret again, save, then press Test connection. A pass re-syncs the room list automatically.",
    ].join("\n\n"),
    docsUrl: `${DOCS}/chatbot/setup`,
  },
  {
    id: "troubleshooting-widget-not-loading",
    group: "troubleshooting",
    title: "Widget not loading on the website",
    body: [
      "Symptoms: the chat bubble never appears on the resort site, or appears on one domain but not another.",
      "Checks in order: 1) Chatbot → Widget & keys: confirm the embed snippet on the page carries this property's key. 2) Widget domains: the site's exact hostname must be listed AND active — a missing or deactivated domain stops the widget on the next chat message. 3) Chatbot → Overview: confirm guest chat is Live (a billing pause also hides the widget).",
      "Fix: add and activate the domain, then reload the site. No snippet change is needed when only the domain list changes.",
    ].join("\n\n"),
    docsUrl: `${DOCS}/chatbot/setup`,
  },
  {
    id: "troubleshooting-booking-offline",
    group: "troubleshooting",
    title: "\"Booking offline\" degradation",
    body: [
      "Symptoms: the chatbot answers property questions but says booking/availability is offline, or quotes fail while chat otherwise works.",
      "Checks in order: 1) Chatbot → Booking system: is a Suite connected, and when did Test connection last pass? 2) Chatbot → Usage/Overview: recent backend failures list the failing tool and error. 3) Is the Suite deployment itself reachable at its base URL?",
      "Fix: restore the binding (re-test until it passes). The chatbot degrades gracefully to property knowledge while the backend is down — no guest data is lost.",
    ].join("\n\n"),
    docsUrl: `${DOCS}/chatbot/troubleshooting`,
  },
  {
    id: "troubleshooting-rate-limit",
    group: "troubleshooting",
    title: "Guest-chat rate limits",
    body: [
      "Symptoms: guests see 'Too many messages right now' and are asked to wait.",
      "Cause: per-tenant and per-IP throttles protect every property's budget — one bot or one rush cannot spend the whole quota. This is working as designed, not an outage.",
      "Fix: usually none needed — guests retry after the stated wait. If legitimate traffic trips it constantly, the quota (not the throttle) is the thing to raise: see Usage, then Orders & Billing.",
    ].join("\n\n"),
    docsUrl: `${DOCS}/chatbot/troubleshooting`,
  },
  {
    id: "troubleshooting-handoff-board-empty",
    group: "troubleshooting",
    title: "Handoff board is empty",
    body: [
      "Symptoms: Chatbot → Handoffs shows no board link, or the Suite board shows no conversations.",
      "Checks in order: 1) Is a booking system connected? Without a binding there is no board to link — connect one under Chatbot → Booking system. 2) Have guests actually asked for a person? Only escalated threads appear as handoffs. 3) Is the team looking at the right property's Suite (property switcher)?",
      "Fix: connect the binding, then ask for a human in a test chat and watch the thread arrive.",
    ].join("\n\n"),
    docsUrl: `${DOCS}/chatbot/staff-handoff`,
  },
  {
    id: "troubleshooting-billing-pause",
    group: "troubleshooting",
    title: "Guest chat paused — billing states and fixes",
    body: [
      "Symptoms: the Chatbot card reads Paused with a reason. trial-expired: the 30-day trial ended without a subscription — fix: subscribe on Orders & Billing; config and history are intact. quota-exceeded: the month's conversation limit is reached — fix: wait for the next calendar month or upgrade the plan. subscription-ended: the subscription is over — fix: resubscribe.",
      "Note: a failed card (past due) does NOT pause chat — Stripe retries while guests keep chatting. Fix the payment method in the Stripe portal from Orders & Billing.",
    ].join("\n\n"),
  },
  {
    id: "troubleshooting-2fa-enrolment",
    group: "troubleshooting",
    title: "Two-factor enrolment steps",
    body: [
      "Symptoms: you want to secure the owner sign-in, or a 2FA code is rejected.",
      "Steps: 1) Open Settings → Security and start two-factor setup. 2) Scan the QR code with an authenticator app (or type the manual key). 3) Enter the app's 6-digit code to confirm. 4) Save the recovery codes somewhere safe — each works once.",
      "Fix for rejected codes: check the phone's clock (authenticator codes are time-based) and type the newest code. Recovery codes bypass a lost phone.",
    ].join("\n\n"),
  },
  {
    id: "subscription-plans-quotas",
    group: "subscription",
    title: "Plans, quotas, and trials",
    body: [
      "Plans differ by monthly conversation quota (one conversation = one guest thread opened in a calendar month). Your live usage vs limit is on Chatbot → Usage and the Home card — those numbers are the truth, not this text.",
      "Trials last 30 days with full Growth features. At 80% of quota the dashboard shows a warning banner; at 120% guest chat pauses unless overage is agreed on a live subscription (trials have no card, so trial overage always pauses).",
      "Change plan, agree overage, or cancel from Orders & Billing (Stripe portal). Cancelling serves to the end of the paid period; invoices live in the Stripe portal, linked from the same page.",
    ].join("\n\n"),
  },
];

/** Display label used in citations for curated (non-docs) entries. */
export function curatedSourceLabel(group: CorpusGroup): string {
  if (group === "business") return "ViveReply business details";
  if (group === "troubleshooting") return "ViveReply troubleshooting";
  return "ViveReply subscription help";
}

/**
 * Plain-text chunker: packs blank-line-separated paragraphs into ~1800
 * character windows (same scale as the property corpus). Deterministic;
 * a single over-long paragraph becomes its own chunk rather than being
 * dropped.
 */
export function chunkText(text: string, targetChars = 1800): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  const chunks: string[] = [];
  let current = "";
  for (const para of paras) {
    if (!current) {
      current = para;
      continue;
    }
    if (current.length + 2 + para.length <= targetChars) {
      current += "\n\n" + para;
      continue;
    }
    chunks.push(current);
    current = para;
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Dependency-free HTML→text for docs ingestion: drops script/style/nav/
 * header/footer/aside, prefers <main>/<article> when present, converts
 * headings, paragraphs, list items and links to readable lines. Crude by
 * design (no new dependencies) — the ingestion report flags pages that
 * yield too little text for a human to check.
 */
export function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const scoped =
    /<main[\s>][\s\S]*?<\/main>/i.exec(html)?.[0] ??
    /<article[\s>][\s\S]*?<\/article>/i.exec(html)?.[0] ??
    html;
  const withoutNoise = scoped
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s>][\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s>][\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s>][\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s>][\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s>][\s\S]*?<\/aside>/gi, "");
  const withBreaks = withoutNoise
    .replace(/<(h1|h2|h3|h4|li|p|tr|div|section|pre)[\s>]/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const text = withBreaks
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
  return { title, text };
}
