// Breaks in a recurring item's charge history (pure). A subscription that was
// cancelled and later restarted shows a long silence between two charges; the chart
// treats what comes after it as a new run, so a different price there reads as a
// restart, not a price change.

/** The length in days of one period of each schedule the recurring form offers. */
const PERIOD_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  four_weekly: 28,
  monthly: 365.25 / 12,
  quarterly: 365.25 / 4,
  yearly: 365.25,
};

const DAY_MS = 86_400_000;

/** Whole days from one ISO date (YYYY-MM-DD) to the next, independent of DST. */
function daysBetween(from: string, to: string): number {
  const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/**
 * The rhythm of a series in days: the item's frequency when it has a fixed period,
 * else (no frequency, "once", anything unknown) the median interval between the
 * charges. Null with fewer than two charges and no usable frequency.
 */
export function chargePeriodDays(dates: string[], frequency?: string): number | null {
  const fixed = frequency ? PERIOD_DAYS[frequency] : undefined;
  if (fixed) return fixed;
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d)).sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.max(1, median);
}

/**
 * Whether `days` between two consecutive charges is a break rather than a late or
 * skipped charge: longer than one and a half periods plus a slack of one period
 * (at least 3 days for weekend shifts, at most a month for bank-date jitter). That is
 * about two missed charges for weekly, four-weekly and monthly (monthly: > 76 days),
 * and one missed charge for quarterly (> 168 days) and yearly (> 579 days).
 */
export function isChargeGap(days: number, periodDays: number): boolean {
  const slack = Math.min(31, Math.max(3, periodDays));
  return days > periodDays * 1.5 + slack;
}

/**
 * Where each run of uninterrupted charges starts, as indices into `dates` (ISO dates,
 * oldest first). Always begins with 0 for a non-empty list; every further index is the
 * first charge after a break. The last entry is the start of the latest run.
 */
export function chargeRunStarts(dates: string[], frequency?: string): number[] {
  if (dates.length === 0) return [];
  const period = chargePeriodDays(dates, frequency);
  const starts = [0];
  if (period == null) return starts;
  for (let i = 1; i < dates.length; i++) {
    if (isChargeGap(daysBetween(dates[i - 1], dates[i]), period)) starts.push(i);
  }
  return starts;
}
