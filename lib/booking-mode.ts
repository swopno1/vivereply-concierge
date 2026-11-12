// Booking-mode resolution (degraded chat). Guest chat must survive a
// missing or unusable booking backend: resolution failure DEGRADES the
// turn, never ends it — a dead guest chat is always worse than a
// degraded one. Suite and catalogue resolve INDEPENDENTLY (separate
// try/catch): a property with a backend but no room rows keeps its
// suite-only tools. Every throw type fail-softs; the real cause goes
// to the server log, and the owner gets an allowlisted reason string.
//
// Deliberately free of runtime imports (types only): the route injects
// the real resolvers, tests inject stubs, so this file runs anywhere.

import type { SuiteAdapter } from "./suite";
import type { DemoRoom } from "@/demo-config/rooms";

export type BookingResolutionDeps = {
  resolveSuite: (propertyId: string) => Promise<SuiteAdapter>;
  resolveCatalogue: (propertyId: string) => Promise<DemoRoom[]>;
};

export type BookingMode = {
  suite: SuiteAdapter | null;
  catalogue: DemoRoom[];
  hasSuite: boolean;
  hasCatalogue: boolean;
  // Owner-safe reason when degraded (feeds Settings → Booking system →
  // Recent backend failures); null on a fully connected turn.
  degradedReason: string | null;
};

// Owner-signal row: written to ToolCallLog on every degraded turn, read
// by the Settings "Recent backend failures" feed (same table the feed
// already reads — no new table). Cards ignore unknown tool names, so
// this row can never surface a guest-facing card.
export const RESOLUTION_TOOL_NAME = "booking_resolution";

// The feed's tool-name contract, shared with Settings so the two cannot
// drift: the five booking tools plus the resolution signal.
export const BACKEND_FAILURE_TOOL_NAMES: string[] = [
  "check_availability",
  "get_quote",
  "create_booking_draft",
  "lookup_booking_by_code",
  "request_booking_details",
  RESOLUTION_TOOL_NAME,
];

// The feed's filter predicate, shared with Settings: an output counts
// as a failure only when it carries a string error.
export function isFailureOutput(output: unknown): output is { error: string } {
  return (
    output !== null && typeof output === "object" && typeof (output as { error?: unknown }).error === "string"
  );
}

export function resolutionFailureRow(conversationId: string, reason: string): {
  conversationId: string;
  toolName: string;
  input: { phase: string };
  output: { error: string };
} {
  return {
    conversationId,
    toolName: RESOLUTION_TOOL_NAME,
    input: { phase: "resolution" },
    output: { error: reason },
  };
}

// Known-safe resolver messages (carry only a property id — no secrets,
// no connection strings). Anything else degrades to the generic line so
// a sick database or decryptor can never leak internals into the feed.
const SAFE_REASON =
  /(is not connected to a booking backend\.|has no room catalogue yet\.|Secret is corrupted or from another key\.)$/;

const GENERIC_REASON = "Booking system resolution failed (see server log).";

function safeReason(propertyId: string, e: unknown, emptyCatalogue: boolean): string {
  if (emptyCatalogue) return `Property "${propertyId}" has no room catalogue yet.`;
  const message = e instanceof Error ? e.message : "";
  if (message && SAFE_REASON.test(message)) return message;
  return GENERIC_REASON;
}

export async function resolveBookingMode(
  propertyId: string,
  deps: BookingResolutionDeps
): Promise<BookingMode> {
  let suite: SuiteAdapter | null = null;
  let catalogue: DemoRoom[] = [];
  let catalogueOk = false;
  const reasons: string[] = [];

  try {
    suite = await deps.resolveSuite(propertyId);
    if (!suite) {
      console.error(`concierge: booking resolution property=${propertyId} suite=EMPTY`);
      suite = null;
      reasons.push(`Property "${propertyId}" is not connected to a booking backend.`);
    }
  } catch (e) {
    console.error(
      `concierge: booking resolution property=${propertyId} suite=FAILED`,
      e instanceof Error ? e.message : e
    );
    reasons.push(safeReason(propertyId, e, false));
  }

  try {
    catalogue = await deps.resolveCatalogue(propertyId);
    if (catalogue.length === 0) {
      console.error(`concierge: booking resolution property=${propertyId} catalogue=EMPTY`);
      catalogue = [];
      reasons.push(safeReason(propertyId, null, true));
    } else {
      catalogueOk = true;
    }
  } catch (e) {
    console.error(
      `concierge: booking resolution property=${propertyId} catalogue=FAILED`,
      e instanceof Error ? e.message : e
    );
    catalogue = [];
    reasons.push(safeReason(propertyId, e, false));
  }

  return {
    suite,
    catalogue,
    hasSuite: suite !== null,
    hasCatalogue: catalogueOk,
    degradedReason: reasons.length > 0 ? reasons.join(" ") : null,
  };
}
