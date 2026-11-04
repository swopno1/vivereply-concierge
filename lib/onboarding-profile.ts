// Onboarding profile parsing (pure, no database): shared by the submit
// (POST) and profile-only save (PATCH) endpoints so both validate
// identically. PATCH exists because POST is once-only gated — without it
// an owner could never edit tone/name/etc. after the first run.
import { cleanSegmentIds } from "@/lib/segments";

export function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export function optStr(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return str(value, max);
}

export function cleanWebsite(value: unknown): string | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  if (trimmed.length > 500) return "invalid";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "invalid";
    return trimmed;
  } catch {
    return "invalid";
  }
}

export type ParsedProfile = {
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  assistantName: string | null;
  tone: string | null;
  languages: string[];
  greeting: string | null;
  suggestionSegments: string[];
};

export function parseProfileInput(
  profile: Record<string, unknown>,
  websiteFallback?: unknown
): { ok: true; data: ParsedProfile } | { ok: false; error: string } {
  const businessName = str(profile.businessName, 150);
  if (!businessName) {
    return { ok: false, error: "Business name is required (max 150 characters)." };
  }
  const website = cleanWebsite(websiteFallback ?? profile.website);
  if (website === "invalid") {
    return { ok: false, error: "Website must be an http(s) URL." };
  }
  const languages = Array.isArray(profile.languages)
    ? profile.languages
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim().slice(0, 30))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  return {
    ok: true,
    data: {
      businessName,
      address: optStr(profile.address, 300),
      phone: optStr(profile.phone, 50),
      email: optStr(profile.email, 150),
      website,
      assistantName: optStr(profile.assistantName, 100),
      tone: optStr(profile.tone, 500),
      languages,
      greeting: optStr(profile.greeting, 500),
      suggestionSegments: cleanSegmentIds(profile.suggestionSegments),
    },
  };
}
