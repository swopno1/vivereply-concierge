// Minimal rate-rule layer (step 2a). One pricing function, used by the
// quote tool — and the Suite booking total (server-side, same DB price)
// is the authority at draft time; any mismatch is surfaced, never hidden.
//
// Demo defaults are FLAT (weekend multiplier 1.0, no seasonal rules), so
// the demo script's flat prices hold. Enable rules by editing RATE_CONFIG:
// weekendMultiplier 1.2 means Fri/Sat nights cost 20% more; a seasonal
// rule multiplies every night inside its month/day window (inclusive).
// All money is integer poisha (1 taka = 100 poisha), never floats.

export type SeasonalRule = {
  name: string;
  startMonth: number; // 1-12
  startDay: number; // 1-31
  endMonth: number;
  endDay: number;
  multiplier: number;
};

export const RATE_CONFIG: {
  weekendMultiplier: number;
  seasonalRules: SeasonalRule[];
} = {
  weekendMultiplier: 1.0,
  seasonalRules: [
    // Example (disabled by the 1.0 default above — uncomment to enable):
    // { name: "Peak season", startMonth: 12, startDay: 20, endMonth: 1, endDay: 5, multiplier: 1.3 },
  ],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(s: unknown): s is string {
  return typeof s === "string" && DATE_RE.test(s);
}

/** Parse YYYY-MM-DD as a UTC-midnight date (calendar date, no TZ shift). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = parseDate(checkOut).getTime() - parseDate(checkIn).getTime();
  return Math.round(ms / 86_400_000);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay(); // 0 = Sunday
  return day === 5 || day === 6; // Friday, Saturday
}

function inSeason(date: Date, rule: SeasonalRule): boolean {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const afterStart = m > rule.startMonth || (m === rule.startMonth && d >= rule.startDay);
  const beforeEnd = m < rule.endMonth || (m === rule.endMonth && d <= rule.endDay);
  if (rule.startMonth <= rule.endMonth) return afterStart && beforeEnd;
  return afterStart || beforeEnd; // wraps the year boundary (e.g. Dec 20 – Jan 5)
}

export type NightlyPrice = {
  date: string;
  pricePoisha: number;
  applied: string[];
};

export function nightlyPricePoisha(basePoisha: number, date: Date): NightlyPrice {
  const applied: string[] = [];
  let multiplier = 1;
  if (isWeekend(date) && RATE_CONFIG.weekendMultiplier !== 1) {
    multiplier *= RATE_CONFIG.weekendMultiplier;
    applied.push(`weekend x${RATE_CONFIG.weekendMultiplier}`);
  }
  for (const rule of RATE_CONFIG.seasonalRules) {
    if (inSeason(date, rule)) {
      multiplier *= rule.multiplier;
      applied.push(`${rule.name} x${rule.multiplier}`);
    }
  }
  return {
    date: date.toISOString().slice(0, 10),
    pricePoisha: Math.round(basePoisha * multiplier),
    applied,
  };
}

export type Quote = {
  nights: number;
  nightly: NightlyPrice[];
  totalPoisha: number;
};

export function quoteForStay(basePoisha: number, checkIn: string, checkOut: string): Quote {
  const nights = nightsBetween(checkIn, checkOut);
  const nightly: NightlyPrice[] = [];
  const start = parseDate(checkIn);
  for (let i = 0; i < nights; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    nightly.push(nightlyPricePoisha(basePoisha, day));
  }
  return {
    nights,
    nightly,
    totalPoisha: nightly.reduce((sum, n) => sum + n.pricePoisha, 0),
  };
}

/** ৳12,500 — whole taka when exact, otherwise two decimals. */
export function formatTaka(poisha: number): string {
  const taka = poisha / 100;
  const text = Number.isInteger(taka)
    ? taka.toLocaleString("en-US")
    : taka.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `৳${text}`;
}
