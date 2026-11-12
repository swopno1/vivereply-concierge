// Room slug rule (shared): the manual mappings API and the catalogue
// sync accept exactly the same slugs, so a synced row is always one the
// owner could have typed. Single home — both import from here.

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Row constraint (mirrors the mappings API): slugs longer than this are invalid. */
export const MAX_SLUG_LEN = 60;

export function isValidRoomSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LEN && SLUG_RE.test(slug);
}

/** Best-effort slug from a room name ("Terracotta Villa" -> "terracotta-villa"). May return "". */
export function slugifyRoomName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, "");
}
