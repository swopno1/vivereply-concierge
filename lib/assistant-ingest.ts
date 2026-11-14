// Platform-corpus ingestion (Handover R1, Lane A). Pure orchestration over
// injected fetch/embed/store steps: the founder-run script wires the real
// ones (global fetch, Gemini embedMany, service Prisma client), and a
// future worker can take over bulk re-indexing through the same seam.
// Docs are fetched as published HTML and stripped without new
// dependencies; failures are per-page and reported, never fatal.

import {
  CURATED_ENTRIES,
  chunkText,
  curatedSourceLabel,
  htmlToText,
  type CuratedEntry,
} from "./assistant-corpus";

export const DOCS_BASE = "https://www.vivereply.com/docs";

// Curated fallback when sitemap discovery fails (85 published pages,
// enumerated from the docs repo 2026-11-14; discovery refreshes this).
export const DOCS_PAGES: string[] = [
  "access",
  "admin-dashboard",
  "audit",
  "blog",
  "blog/categories",
  "blog/edit",
  "blog/edit/preview",
  "blog/new",
  "blog/pending",
  "blog/settings",
  "blog/tags",
  "bookings",
  "bookings/detail",
  "bookings/detail/folio",
  "bookings/hold-to-payment",
  "bookings/new",
  "chatbot",
  "chatbot-admin",
  "chatbot/best-practices",
  "chatbot/bridge-api",
  "chatbot/capabilities",
  "chatbot/glossary",
  "chatbot/guest-chat",
  "chatbot/integration",
  "chatbot/roadmap",
  "chatbot/setup",
  "chatbot/staff-handoff",
  "chatbot/troubleshooting",
  "chatbot/verification-privacy",
  "data-flow",
  "expenses",
  "expenses/new",
  "finance",
  "finance/accounts",
  "finance/banglaqr-verification",
  "finance/journals",
  "finance/months",
  "finance/payables",
  "finance/petty-cash",
  "finance/reports",
  "front-desk",
  "front-desk/cash",
  "front-desk/daily-sheet",
  "front-desk/night-audit",
  "guests",
  "housekeeping",
  "hr",
  "hr/attendance",
  "hr/payroll",
  "hr/staff",
  "index",
  "inventory",
  "inventory/counts",
  "inventory/move",
  "inventory/move/issue",
  "inventory/move/receive",
  "inventory/move/waste",
  "payments",
  "purchasing",
  "purchasing/new",
  "purchasing/order",
  "purchasing/suppliers",
  "room-service",
  "room-service/menu",
  "room-service/new",
  "rooms",
  "rooms/edit",
  "rooms/rates",
  "settings",
  "settings/chatbot",
  "settings/general",
  "settings/modules",
  "settings/payments",
  "settings/payments/stripe-setup",
  "settings/pms",
  "settings/tax",
  "settings/users",
  "system",
  "system/deployment",
  "website",
  "website/booking",
  "website/explore",
  "website/plan",
  "website/policies",
  "website/stories",
];

export interface IngestDoc {
  /** Display title (docs <title>, or the curated entry title). */
  title: string;
  /** Citation identity: full docs URL, or `curated:<id>`. */
  source: string;
  chunks: string[];
}

export interface PageFetch {
  fetchPage(url: string): Promise<{ status: number; html: string }>;
  discoverSitemap?(): Promise<string[] | null>;
}

export interface ChunkStore {
  /** Idempotent per-document replace (delete-by-source + insert). */
  replaceDocument(doc: IngestDoc, embeddings: number[][]): Promise<number>;
}

/** Extract /docs/ page paths from sitemap XML; null when unusable. */
export function parseSitemapXml(xml: string): string[] | null {
  try {
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
    const paths = locs
      .map((u) => {
        const i = u.indexOf("/docs/");
        if (i < 0) return null;
        return u.slice(i + "/docs/".length).replace(/\/$/, "");
      })
      .filter((p): p is string => !!p);
    const deduped = [...new Set(paths)];
    return deduped.length > 0 ? deduped : null;
  } catch {
    return null;
  }
}

function prettifySlug(slug: string): string {
  return slug
    .split("/")
    .map((part) => part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" — ");
}

export interface PageOutcome {
  path: string;
  status: "ok" | "skipped" | "failed";
  chunks: number;
  detail?: string;
}

export interface IngestReport {
  pages: PageOutcome[];
  curatedDocuments: number;
  documents: number;
  chunks: number;
}

/** Minimum extracted characters for a docs page to be worth indexing. */
export const MIN_PAGE_CHARS = 400;

/**
 * Build the full ingest set (docs pages + curated entries) and store it
 * through the injected steps. Pure orchestration — no network, embedding,
 * or database calls of its own, so tests drive it end to end with fakes.
 */
export async function ingestAssistantCorpus(deps: PageFetch & ChunkStore & { embed(texts: string[]): Promise<number[][]> }): Promise<IngestReport> {
  const report: IngestReport = { pages: [], curatedDocuments: 0, documents: 0, chunks: 0 };

  let pages: string[] | null = null;
  if (deps.discoverSitemap) {
    try {
      pages = await deps.discoverSitemap();
    } catch {
      pages = null;
    }
  }
  const paths = pages && pages.length > 0 ? pages : DOCS_PAGES;

  for (const path of paths) {
    const url = path === "index" ? `${DOCS_BASE}` : `${DOCS_BASE}/${path}`;
    let fetched: { status: number; html: string };
    try {
      fetched = await deps.fetchPage(url);
    } catch (e) {
      report.pages.push({ path, status: "failed", chunks: 0, detail: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (fetched.status !== 200) {
      report.pages.push({ path, status: "failed", chunks: 0, detail: `HTTP ${fetched.status}` });
      continue;
    }
    const { title, text } = htmlToText(fetched.html);
    if (text.length < MIN_PAGE_CHARS) {
      report.pages.push({ path, status: "skipped", chunks: 0, detail: `too little text (${text.length} chars)` });
      continue;
    }
    const chunks = chunkText(text);
    const embeddings = await deps.embed(chunks);
    const stored = await deps.replaceDocument(
      { title: title || prettifySlug(path), source: url, chunks },
      embeddings
    );
    report.pages.push({ path, status: "ok", chunks: stored });
    report.documents += 1;
    report.chunks += stored;
  }

  for (const entry of CURATED_ENTRIES) {
    const chunks = chunkText(`${entry.title}\n\n${entry.body}`);
    const embeddings = await deps.embed(chunks);
    const stored = await deps.replaceDocument(
      { title: entry.title, source: `curated:${entry.id}`, chunks },
      embeddings
    );
    report.curatedDocuments += 1;
    report.documents += 1;
    report.chunks += stored;
  }

  return report;
}

const CURATED_BY_ID = new Map(CURATED_ENTRIES.map((e) => [e.id, e]));

/** User-facing citation for a stored source value (docs URL or curated id). */
export function citationFor(source: string, title: string): string {
  if (source.startsWith("http")) return `${title} — ${source}`;
  const id = source.startsWith("curated:") ? source.slice("curated:".length) : source;
  const entry = CURATED_BY_ID.get(id);
  if (entry?.docsUrl) return `${entry.title} — ${entry.docsUrl}`;
  return entry ? `${entry.title} (${curatedSourceLabel(entry.group)})` : title;
}
