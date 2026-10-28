// Onboarding budgets + pure helpers (RAG engine). Hard ceilings per run:
// pages, characters, files, bytes, and estimated embed tokens. Pre-flight
// checks the static caps synchronously at submit time; the worker enforces
// the dynamic ones mid-run and aborts to PARTIAL. Pure (no Prisma import)
// so budgets and filename rules probe without a database.

export const ONBOARDING_BUDGET = {
  maxPages: 50,
  maxChars: 200_000,
  maxFiles: 10,
  maxTotalBytes: 25 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  maxWellKnownBytes: 2 * 1024 * 1024,
  maxEmbedTokens: 500_000,
};

export const UPLOAD_EXTS = ["pdf", "md", "markdown", "txt", "xlsx", "xls", "docx", "csv"];

// Rough embed-token estimate (chars / 4). Used for ceiling checks only,
// never billed — the engine just stops when estimates cross the cap.
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

export function wellKnownUrl(website: string): string | null {
  let url: URL;
  try {
    url = new URL(website);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return `${url.protocol}//${url.host}/.well-known/vivereply-knowledge.json`;
}

// Storage-safe filename: basename only, no traversal, extension preserved.
// Returns null when nothing safe remains.
export function sanitizeFilename(raw: string): string | null {
  const base = raw.split(/[\\/]/).pop()?.trim() ?? "";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  if (!cleaned || cleaned.length > 120) return null;
  const ext = cleaned.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !(UPLOAD_EXTS as readonly string[]).includes(ext)) return null;
  return cleaned;
}

export function storagePath(propertyId: string, filename: string): string {
  const safeProp = propertyId.replace(/[^a-zA-Z0-9-]+/g, "_").slice(0, 80);
  return `${safeProp}/${Date.now()}-${filename}`;
}

export type RunStats = {
  pagesVisited?: number;
  charsSeen?: number;
  docsParsed?: number;
  chunksWritten?: number;
  embedTokensEstimated?: number;
  truncated?: boolean;
  truncateReason?: string;
};

export function overBudget(stats: RunStats): string | null {
  if ((stats.pagesVisited ?? 0) > ONBOARDING_BUDGET.maxPages) return "page cap reached";
  if ((stats.charsSeen ?? 0) > ONBOARDING_BUDGET.maxChars) return "character cap reached";
  if ((stats.embedTokensEstimated ?? 0) > ONBOARDING_BUDGET.maxEmbedTokens) {
    return "embed-token cap reached";
  }
  return null;
}
