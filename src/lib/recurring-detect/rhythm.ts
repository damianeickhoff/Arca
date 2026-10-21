import type { DetectedFrequency } from "./types";

// The "once per period" and "steady rhythm" tests. A series has a rhythm when every gap
// between two payments is one period (or, at most once, two: a missed month), the gaps
// barely vary, and the last payment is recent. Monthly also asks for a fixed day of the
// month, which is what tells it apart from four-weekly (28 days, drifting).

type Rhythm = {
  frequency: DetectedFrequency;
  /** Average length in days. */
  period: number;
  /** The window the typical gap must fall in. */
  min: number;
  max: number;
};

// Tried in this order: a gap can only ever be one or two periods long, so the first
// rhythm whose tests all pass is the answer. Monthly goes before four-weekly because
// their windows overlap; the day-of-month test decides between them.
export const RHYTHMS: readonly Rhythm[] = [
  { frequency: "weekly", period: 7, min: 6, max: 8 },
  { frequency: "monthly", period: 30.44, min: 28, max: 33 },
  { frequency: "four_weekly", period: 28, min: 26, max: 30 },
  { frequency: "quarterly", period: 91.31, min: 85, max: 95 },
  { frequency: "yearly", period: 365.25, min: 355, max: 375 },
];

/** Gap spread (median absolute deviation / median) must stay under this. */
export const MAX_GAP_SPREAD = 0.2;
/** A monthly payment's day of the month may move this many days either way. */
export const MONTH_DAY_TOLERANCE = 3;
/** Older than this many periods and the series has stopped. */
export const STOPPED_AFTER_PERIODS = 1.5;

export type RhythmResult =
  | {
      ok: true;
      frequency: DetectedFrequency;
      period: number;
      /** Monthly / quarterly / yearly: the day of the month it is due. */
      dueDay: number | null;
      /** Periods skipped inside the run (0 or 1). */
      missed: number;
      /** MAD / median of the gaps, 0 = perfectly regular. */
      spread: number;
    }
  | { ok: false; reason: "tooFew" | "noRhythm" | "stopped" };

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation divided by the median: 0 for identical values. */
export function relativeSpread(values: number[]): number {
  const m = median(values);
  if (m === 0) return 0;
  return median(values.map((v) => Math.abs(v - m))) / m;
}

/** Distance between two days of the month, wrapping around the month end (the 30th
 *  and the 1st are two days apart: a bill due on the 1st paid early). */
function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 31 - d);
}

/** The day of the month every payment sits closest to, or null when they don't all
 *  stay within MONTH_DAY_TOLERANCE of one day. */
export function fixedMonthDay(days: number[]): number | null {
  let best: { day: number; worst: number; total: number } | null = null;
  for (let day = 1; day <= 31; day++) {
    const distances = days.map((d) => dayDistance(d, day));
    const worst = Math.max(...distances);
    const total = distances.reduce((s, d) => s + d, 0);
    if (!best || worst < best.worst || (worst === best.worst && total < best.total)) best = { day, worst, total };
  }
  return best && best.worst <= MONTH_DAY_TOLERANCE ? best.day : null;
}

/** Most common value; ties go to the one seen first. */
export function mode(values: number[]): number {
  const counts = new Map<number, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

function testRhythm(rhythm: Rhythm, dates: string[], gaps: number[]): Omit<Extract<RhythmResult, { ok: true }>, "ok"> | null {
  let missed = 0;
  const normalised: number[] = [];
  for (const gap of gaps) {
    const periods = Math.round(gap / rhythm.period);
    // Zero periods: two payments inside one period, so this isn't a bill. More than
    // two: a long break, and the run isn't steady.
    if (periods < 1 || periods > 2) return null;
    missed += periods - 1;
    normalised.push(gap / periods);
  }
  if (missed > 1) return null;
  const typical = median(normalised);
  if (typical < rhythm.min || typical > rhythm.max) return null;
  const spread = relativeSpread(normalised);
  if (spread >= MAX_GAP_SPREAD) return null;

  const days = dates.map((d) => Number(d.slice(8, 10)));
  let dueDay: number | null = null;
  if (rhythm.frequency === "monthly") {
    dueDay = fixedMonthDay(days);
    if (dueDay == null) return null;
  } else if (rhythm.frequency === "quarterly" || rhythm.frequency === "yearly") {
    dueDay = fixedMonthDay(days) ?? days[0];
  }
  return { frequency: rhythm.frequency, period: rhythm.period, dueDay, missed, spread };
}

/**
 * Classifies a series of payment dates. `dates` must be sorted oldest first.
 * At least three payments are needed (two for yearly, or `minOccurrences` when the
 * caller lowers it for a curated merchant), and the last one must be recent.
 */
export function classifyRhythm(dates: string[], today: string, minOccurrences = 3): RhythmResult {
  if (dates.length < 2) return { ok: false, reason: "tooFew" };
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));

  for (const rhythm of RHYTHMS) {
    const needed = rhythm.frequency === "yearly" ? Math.min(2, minOccurrences) : minOccurrences;
    if (dates.length < needed) continue;
    const result = testRhythm(rhythm, dates, gaps);
    if (!result) continue;
    if (daysBetween(dates[dates.length - 1], today) > rhythm.period * STOPPED_AFTER_PERIODS) {
      return { ok: false, reason: "stopped" };
    }
    return { ok: true, ...result };
  }
  return { ok: false, reason: dates.length < minOccurrences ? "tooFew" : "noRhythm" };
}
