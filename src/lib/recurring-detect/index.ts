import { RECURRING_MERCHANTS, type RecurringMerchant } from "@/config/recurring-merchants";
import { resolveFriendlyName } from "@/lib/friendly-names";
import type { DetectTransaction, RecurringCandidate, RecurringKind } from "./types";
import { classifyRhythm } from "./rhythm";
import { classifyAmount } from "./amount";
import { scoreSeries } from "./score";
import { amountBands, amountBucket, byDate, derivePattern, groupByCounterparty } from "./grouping";

// The recurring detector, pure: transactions in, candidate recurring items out. A
// payment is recurring when the same counterparty is paid once per period, at a steady
// rhythm, with a steady amount (see docs/recurring-detection-plan.md). The database half
// (lib/recurring-suggestions.ts) loads the transactions and stores what this finds as
// suggestions for the user to accept.

export type { DetectTransaction, RecurringCandidate, DetectedFrequency } from "./types";
export { confidenceLevel, type ConfidenceLevel } from "./score";

export type DetectOptions = {
  /** YYYY-MM-DD; a series whose last payment is too long ago has stopped. */
  today: string;
  /** A merchant's own "Recognised by" patterns, tried first as the match pattern. */
  merchantPatterns?: Map<number, string[]>;
  curated?: readonly RecurringMerchant[];
};

/** Variable amounts belong to bills paid monthly or less often; a weekly
 *  payment that changes every time is shopping. */
const VARIABLE_FREQUENCIES = new Set(["monthly", "four_weekly", "quarterly", "yearly"]);
/** Range items match a little beyond what was seen, so next month's higher energy bill
 *  still counts as paid. */
const RANGE_MARGIN = 0.1;

/** How far back a series is read: a bit over a year, and two years for yearly ones. */
const RECENT_DAYS = 400;
const YEARLY_DAYS = 800;

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function curatedMatch(descriptions: string[], income: boolean, curated: readonly RecurringMerchant[]): RecurringMerchant | null {
  const lowered = descriptions.map((d) => d.toLowerCase());
  return (
    curated.find((m) => (m.type === "income") === income && lowered.every((d) => d.includes(m.pattern.toLowerCase()))) ?? null
  );
}

/** The first payment's month, on the due day: the editor reads the due day from the
 *  start date, and quarterly and yearly items count their months from it. */
function anchorDate(first: string, dueDay: number | null): string {
  if (dueDay == null) return first;
  const [year, month] = first.split("-").map(Number);
  const day = Math.min(dueDay, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${first.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

function titleCase(text: string) {
  return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export type SeriesContext = {
  today: string;
  signature: string;
  /** Match-pattern candidates tried before the shared-words fallback. */
  hints?: (string | null | undefined)[];
  curated?: readonly RecurringMerchant[];
  /** True when the series is one amount band of a bigger group: the item then always
   *  matches on amount too, so the group's other payments stay out of it. */
  band?: boolean;
};

export type SeriesResult =
  | { ok: true; candidate: RecurringCandidate }
  | { ok: false; reason: "tooFew" | "noRhythm" | "stopped" | "amount" | "pattern" };

/**
 * Runs the rhythm and amount tests on one series (all one counterparty and direction)
 * and builds the candidate. Exported for the migration pass, which re-tests the
 * transactions an existing auto item matched.
 */
export function evaluateSeries(input: DetectTransaction[], ctx: SeriesContext): SeriesResult {
  const txns = [...input].sort(byDate);
  if (txns.length === 0) return { ok: false, reason: "tooFew" };
  const income = txns[0].direction === "income";
  const descriptions = txns.map((t) => t.description);
  const curated = curatedMatch(descriptions, income, ctx.curated ?? RECURRING_MERCHANTS);

  // A curated merchant may show after two payments; everything else needs three.
  const rhythm = classifyRhythm(txns.map((t) => t.date), ctx.today, curated ? 2 : 3);
  if (!rhythm.ok) return { ok: false, reason: rhythm.reason };

  const amount = classifyAmount(txns.map((t) => t.amount));
  if (!amount || (amount.kind === "variable" && !VARIABLE_FREQUENCIES.has(rhythm.frequency))) {
    return { ok: false, reason: "amount" };
  }

  const merchantName = txns.find((t) => t.merchantName)?.merchantName ?? null;
  const matchPattern = derivePattern(descriptions, [curated?.pattern, ...(ctx.hints ?? []), merchantName]);
  if (!matchPattern) return { ok: false, reason: "pattern" };

  const type: RecurringKind = curated?.type ?? (income ? "income" : "bill");
  const name =
    curated?.name ?? merchantName ?? resolveFriendlyName(txns[txns.length - 1].description) ?? titleCase(matchPattern);
  const last = txns[txns.length - 1];
  // A curated subscription matches on its name alone, as before: prices change. Inside
  // a band the amount keeps the merchant's other purchases out.
  const patternOnly = curated != null && !ctx.band && amount.kind === "fixed";

  const candidate: RecurringCandidate = {
    signature: ctx.signature,
    name,
    type,
    frequency: rhythm.frequency,
    dueDay: rhythm.dueDay,
    startDate: anchorDate(txns[0].date, rhythm.dueDay),
    amount: amount.amount,
    amountMin: amount.kind === "variable" ? amount.min : null,
    amountMax: amount.kind === "variable" ? amount.max : null,
    matchPattern,
    matchAmount: amount.kind === "fixed" && !patternOnly ? amount.amount : null,
    matchAmountMin: amount.kind === "variable" ? Math.floor(amount.min * (1 - RANGE_MARGIN) * 100) / 100 : null,
    matchAmountMax: amount.kind === "variable" ? Math.ceil(amount.max * (1 + RANGE_MARGIN) * 100) / 100 : null,
    budgetType: type === "income" ? null : (curated?.budgetType ?? (curated ? "willen" : "nodig")),
    merchantId: last.merchantId,
    occurrences: txns.length,
    firstDate: txns[0].date,
    lastDate: last.date,
    confidence: scoreSeries({
      frequency: rhythm.frequency,
      occurrences: txns.length,
      spread: rhythm.spread,
      missed: rhythm.missed,
      amount,
      curated: curated != null,
    }),
    curated: curated != null,
    transactionIds: txns.map((t) => t.id),
  };
  return { ok: true, candidate };
}

/**
 * evaluateSeries on recent history only: the last RECENT_DAYS, then YEARLY_DAYS (which
 * a yearly payment needs). The migration pass re-tests old auto items with it.
 */
export function evaluateRecent(txns: DetectTransaction[], ctx: SeriesContext): SeriesResult {
  const recent = txns.filter((t) => t.date >= shiftDays(ctx.today, -RECENT_DAYS));
  const longer = txns.filter((t) => t.date >= shiftDays(ctx.today, -YEARLY_DAYS));
  const first = recent.length > 0 ? evaluateSeries(recent, ctx) : ({ ok: false, reason: "tooFew" } as const);
  if (first.ok || longer.length <= recent.length) return first;
  return evaluateSeries(longer, ctx);
}

/**
 * Every recurring series in `txns`. Each counterparty is first tested as one series
 * (a subscription, a salary, an energy bill whose amount varies); when that fails, each
 * of its amount bands is tested on its own (the subscription inside a shop's purchases).
 *
 * Only recent history counts: the last RECENT_DAYS, so years of price rises or an old
 * gap don't hide a bill that is steady now, then YEARLY_DAYS for a yearly payment.
 */
export function detectRecurring(txns: DetectTransaction[], options: DetectOptions): RecurringCandidate[] {
  const out: RecurringCandidate[] = [];
  const recentFrom = shiftDays(options.today, -RECENT_DAYS);
  for (const [key, all] of groupByCounterparty(txns)) {
    const merchantId = all[0].merchantId;
    const hints = merchantId != null ? (options.merchantPatterns?.get(merchantId) ?? []) : [];
    const base = { today: options.today, hints, curated: options.curated, signature: `r:${key}` };

    const whole = evaluateRecent(all, base);
    if (whole.ok) {
      out.push(whole.candidate);
      continue;
    }
    const group = all.filter((t) => t.date >= recentFrom);
    const bands = amountBands(group);
    if (bands.length < 2) continue;
    for (const band of bands) {
      if (band.length < 2) continue;
      const result = evaluateSeries(band, { ...base, band: true, signature: `r:${key}:${amountBucket(band)}` });
      if (result.ok) out.push(result.candidate);
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
}
