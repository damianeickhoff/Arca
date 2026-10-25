// The figures behind Insights › Overview — pure, so they can be tested and shared: the
// hero's running totals and projection, the block map's layout, and the summary card's
// facts, which the card shows as they are when AI is off and the AI provider gets exactly when
// it is on ("AI explains, the app computes").

import { daysInclusive, financialMonthForDate, financialMonthRangeByMonth, offsetFinancialMonth, shiftDate, type FinancialMonthConfig } from "@/lib/date-range";
import { roundToCents } from "@/lib/transaction-splits";

/** The average per day over `days` days (at least one), in cents. */
export function averagePerDay(total: number, days: number): number {
  return roundToCents(total / Math.max(1, days));
}

/**
 * The rows of a breakdown sorted by amount, and what is left of `total` once they are
 * counted: "Other" (uncategorised spending, categories hidden from spending rows).
 */
export function withOther<T extends { spent: number }>(rows: T[], total: number): { rows: T[]; other: number; otherShare: number } {
  const sorted = [...rows].filter((r) => r.spent > 0).sort((a, b) => b.spent - a.spent);
  const counted = sorted.reduce((s, r) => s + r.spent, 0);
  const other = roundToCents(Math.max(0, total - counted));
  return { rows: sorted, other, otherShare: total > 0 ? other / total : 0 };
}

/** Spending day by day as a running total, this period against the one before it. */
export interface RunningTotals {
  /** Days in the period. */
  days: number;
  /** Days of the period up to and including today; every day once it is over, none
   *  before it starts. */
  elapsed: number;
  /** This period's running total at the end of each day so far (`elapsed` entries). */
  current: number[];
  /** The previous period's running total, aligned by day index (one entry per day of
   *  the previous period, which can be a day or two shorter or longer). */
  previous: number[];
  /** Where the period ends: spent so far, the bills still due and day-to-day spending
   *  for the days left (see runningTotals); null unless it is running. */
  projected: number | null;
  /** The previous period's total by the same day; null when it had no spending or
   *  this period has no days yet. */
  previousAtSameDay: number | null;
  /** This period minus the previous one by the same day; null without a previous. */
  difference: number | null;
}

/**
 * Day-to-day spending per day: spending no recurring bill pays (groceries, fuel, a
 * holiday), over this period so far and the periods before it together. Taking the
 * history along keeps a one-off early in the period from being read as the month's
 * pace; as the period runs, its own days weigh in more.
 */
export function dayToDayPerDay(input: {
  /** Day-to-day spending in this period so far, and the days that covers. */
  current: { spent: number; days: number };
  /** The same over the periods before it (only days since the first transaction). */
  history: { spent: number; days: number };
}): number {
  const days = input.current.days + input.history.days;
  return days > 0 ? roundToCents((input.current.spent + input.history.spent) / days) : 0;
}

/**
 * The period to compare with: for a whole budget month the budget month before it (its
 * own payday to payday, so a 30-day month is compared with a 31-day one), else the
 * stretch of the same length right before `from`.
 */
export function previousPeriod(from: string, to: string, config: number | FinancialMonthConfig): { from: string; to: string } {
  if (isWholeFinancialMonth(from, to, config)) return financialMonthRangeByMonth(offsetFinancialMonth(financialMonthForDate(from, config), -1), config);
  const prevTo = shiftDate(from, -1);
  return { from: shiftDate(prevTo, -(daysInclusive(from, to) - 1)), to: prevTo };
}

/**
 * Running totals for the hero's line chart. The previous period (previousPeriod) is
 * aligned by day index, so day 1 is compared with day 1. The projection is
 * built from what is known, never a straight line from the first days (rent and a
 * holiday paid on payday would be multiplied by the month's length): spent so far, plus
 * the bills still due before the end, plus day-to-day spending per day for the days left.
 */
export function runningTotals(input: {
  from: string;
  to: string;
  today: string;
  /** Spending per date in this period. */
  daily: ReadonlyMap<string, number>;
  /** Spending per date in the previous period. */
  previousDaily: ReadonlyMap<string, number>;
  /** The previous period; the same length right before `from` when left out. */
  previousRange?: { from: string; to: string };
  /** What is still to come while the period runs: the bills due from today to the end
   *  and day-to-day spending per day (dayToDayPerDay). */
  ahead: { billsDue: number; perDay: number };
}): RunningTotals {
  const { from, to, today } = input;
  const days = Math.max(1, daysInclusive(from, to));
  const elapsed = today < from ? 0 : today > to ? days : daysInclusive(from, today);
  const prevFrom = input.previousRange?.from ?? shiftDate(from, -days);
  const prevDays = input.previousRange ? Math.max(1, daysInclusive(input.previousRange.from, input.previousRange.to)) : days;

  const accumulate = (start: string, count: number, map: ReadonlyMap<string, number>) => {
    const out: number[] = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += map.get(shiftDate(start, i)) ?? 0;
      out.push(roundToCents(total));
    }
    return out;
  };
  const current = accumulate(from, elapsed, input.daily);
  const previous = accumulate(prevFrom, prevDays, input.previousDaily);

  const spent = current[elapsed - 1] ?? 0;
  const running = from <= today && today <= to;
  // Today's own spending is already in `spent`, so the per-day rate covers the days after it.
  const projected = running ? roundToCents(spent + input.ahead.billsDue + input.ahead.perDay * (days - elapsed)) : null;
  const previousAtSameDay = elapsed > 0 && previous[prevDays - 1] > 0 ? previous[Math.min(elapsed, prevDays) - 1] : null;
  return {
    days,
    elapsed,
    current,
    previous,
    projected,
    previousAtSameDay,
    difference: previousAtSameDay != null ? roundToCents(spent - previousAtSameDay) : null,
  };
}

/** The running total drawn in a `width` × `height` viewBox, shared by the hero's line and
 *  the "This month against last" card so the two never disagree. */
export interface RunningTotalPlot {
  /** This period's line up to today; null before the period starts. */
  current: string | null;
  /** The previous period's line over the whole length; null when it had no spending. */
  previous: string | null;
  /** From today to where the period ends at this pace; null unless it is running. */
  projection: { x1: number; y1: number; x2: number; y2: number } | null;
  /** The budget's height in viewBox units; null without a budget. */
  budgetY: number | null;
  /** Today's point, in percent of the box; null before the period starts. */
  today: { left: number; top: number } | null;
}

/**
 * Lays out the running totals: the scale fits the highest of this period, the previous
 * one, the projection and the budget, with `top` units kept free above it.
 */
export function runningTotalPlot(totals: RunningTotals, opts: { width: number; height: number; top: number; budget?: number | null }): RunningTotalPlot {
  const { days, elapsed, current, previous, projected } = totals;
  const { width: W, height: H, top, budget = null } = opts;
  const spent = current[elapsed - 1] ?? 0;
  const previousTotal = previous.at(-1) ?? 0;
  const ceiling = Math.max(1, previousTotal, projected ?? 0, budget ?? 0, spent) * 1.04;
  const x = (day: number) => (day / days) * W;
  const y = (v: number) => H - (v / ceiling) * (H - top);
  const points = (values: number[]) => [`0,${H}`, ...values.map((v, i) => `${x(i + 1)},${y(v)}`)].join(" ");
  return {
    current: elapsed > 0 ? points(current) : null,
    // A previous month a day or two longer ends at the right edge with this one.
    previous: previous.some((v) => v > 0) ? points(previous.slice(0, days)) : null,
    projection: projected != null && elapsed > 0 && elapsed < days ? { x1: x(elapsed), y1: y(spent), x2: W, y2: y(projected) } : null,
    budgetY: budget != null ? y(budget) : null,
    today: elapsed > 0 ? { left: (x(elapsed) / W) * 100, top: (y(spent) / H) * 100 } : null,
  };
}

/**
 * The month a period stands for, as YYYY-MM, when it is about a month long (a calendar
 * month or a budget period from payday to payday): the month its middle day falls in.
 * Null for weeks, quarters and other ranges, which are called "the period" instead.
 */
export function monthOfPeriod(from: string, to: string): string | null {
  const days = daysInclusive(from, to);
  // Up to 33: the weekend rule can start a budget month two days early.
  if (days < 28 || days > 33) return null;
  return shiftDate(from, Math.floor((days - 1) / 2)).slice(0, 7);
}

/** Whether [from, to] is exactly one financial month (payday to payday), as the period
 *  selector's months are. */
export function isWholeFinancialMonth(from: string, to: string, config: number | FinancialMonthConfig): boolean {
  const range = financialMonthRangeByMonth(financialMonthForDate(from, config), config);
  return range.from === from && range.to === to;
}

/**
 * The budget the running total draws as a line: the overall budget when one is set,
 * otherwise the category budgets added up (the target Safe to spend uses). A monthly
 * budget applies to every whole financial month that has started, the current one or
 * a past one; a weekly one only to its own week. Null without any budget, for a period
 * that isn't a budget period and for one still to come. `allSpending` marks a budget
 * shown beside filtered lines: it covers all spending, not the selection.
 */
export function runningTotalBudget(input: {
  from: string;
  to: string;
  today: string;
  financialMonth: number | FinancialMonthConfig;
  /** The budget overview's range, its overall budget and the category budgets added up. */
  overview: { from: string; to: string; budget: { amount: number; period: "weekly" | "monthly" } | null; allocated: number } | null;
  /** A category or account filter is on. */
  filtered: boolean;
}): { amount: number; allSpending: boolean } | null {
  const { from, to, today, overview } = input;
  if (!overview || from > today) return null;
  const amount = (overview.budget?.amount ?? 0) > 0 ? overview.budget!.amount : overview.allocated;
  if (amount <= 0) return null;
  const applies =
    overview.budget?.period === "weekly"
      ? from === overview.from && to === overview.to
      : isWholeFinancialMonth(from, to, input.financialMonth);
  return applies ? { amount: roundToCents(amount), allSpending: input.filtered } : null;
}

/**
 * The block map's layout ("area is money"): the largest block is a column of its own
 * over the full height; the others share the rest in two rows, each block going to the
 * row with the smaller total so far, which keeps the two rows about equally tall.
 * Blocks without money are left out; a single block left over gets the whole height.
 */
export function blockMapLayout<T extends { value: number }>(blocks: readonly T[]): { lead: T | null; rows: T[][] } {
  const [lead, ...rest] = blocks.filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
  if (!lead) return { lead: null, rows: [] };
  if (rest.length <= 1) return { lead, rows: rest.length ? [rest] : [] };
  const rows: T[][] = [[], []];
  const sums = [0, 0];
  for (const b of rest) {
    const i = sums[0] <= sums[1] ? 0 : 1;
    rows[i].push(b);
    sums[i] += b.value;
  }
  return { lead, rows };
}

/** Spending against income: ahead of it, within it, or no income at all yet. */
export type Balance = { kind: "ahead" | "kept"; amount: number } | { kind: "noIncome"; amount: number };

export function balanceOf(income: number, expense: number): Balance {
  if (income <= 0) return { kind: "noIncome", amount: roundToCents(expense) };
  const diff = roundToCents(income - expense);
  return diff < 0 ? { kind: "ahead", amount: -diff } : { kind: "kept", amount: diff };
}

/** The figures the Insights overview already shows, as the summary's only input. */
export interface SummaryFacts {
  from: string;
  to: string;
  ongoing: boolean;
  income: number;
  expense: number;
  saved: number;
  /** Whole-percent change against the previous period of the same length, signed. */
  incomeChangePct: number | null;
  expenseChangePct: number | null;
  avgPerDay: number;
  /** Last period's spending per day; null when it had none. */
  prevAvgPerDay: number | null;
  /** Safe to spend for the rest of the budget period after the bills still due; null
   *  when the period is over or there is no budget. */
  left: { amount: number; perDay: number; daysLeft: number } | null;
  biggestGroup: { name: string; spent: number } | null;
  topMerchant: { name: string; total: number; visits: number } | null;
  /** Spending outside every group, with the uncategorised transactions in it. */
  other: { amount: number; sharePct: number; transactions: number };
  categories: { name: string; spent: number; budget: number | null }[];
  merchants: { name: string; total: number; visits: number }[];
  largest: { name: string | null; amount: number; category: string | null } | null;
}

export interface SummaryInput {
  from: string;
  to: string;
  ongoing: boolean;
  income: number;
  expense: number;
  incomeChangePct: number | null;
  expenseChangePct: number | null;
  /** Days of the period up to today. */
  daysElapsed: number;
  prevExpense: number;
  prevDays: number;
  left: { amount: number; perDay: number; daysLeft: number } | null;
  /** Spending per group, any order. */
  groups: { name: string; spent: number }[];
  categories: { name: string; spent: number; budget: number | null }[];
  /** Sorted, biggest first. */
  merchants: { name: string; total: number; visits: number }[];
  largest: { name: string | null; amount: number; category: string | null } | null;
  uncategorised: number;
}

/** Turns the overview's figures into the summary facts, every amount in cents. */
export function buildSummaryFacts(input: SummaryInput): SummaryFacts {
  const groups = withOther(input.groups, input.expense);
  const top = groups.rows[0];
  return {
    from: input.from,
    to: input.to,
    ongoing: input.ongoing,
    income: roundToCents(input.income),
    expense: roundToCents(input.expense),
    saved: roundToCents(input.income - input.expense),
    incomeChangePct: input.incomeChangePct,
    expenseChangePct: input.expenseChangePct,
    avgPerDay: averagePerDay(input.expense, input.daysElapsed),
    prevAvgPerDay: input.prevExpense > 0 ? averagePerDay(input.prevExpense, input.prevDays) : null,
    left: input.left ? { amount: roundToCents(input.left.amount), perDay: roundToCents(input.left.perDay), daysLeft: input.left.daysLeft } : null,
    biggestGroup: top ? { name: top.name, spent: roundToCents(top.spent) } : null,
    topMerchant: input.merchants[0] ? { ...input.merchants[0], total: roundToCents(input.merchants[0].total) } : null,
    other: { amount: groups.other, sharePct: Math.round(groups.otherShare * 100), transactions: input.uncategorised },
    categories: input.categories.slice(0, 8).map((c) => ({ ...c, spent: roundToCents(c.spent) })),
    merchants: input.merchants.slice(0, 6).map((m) => ({ ...m, total: roundToCents(m.total) })),
    largest: input.largest ? { ...input.largest, amount: roundToCents(input.largest.amount) } : null,
  };
}

/** The AI's structured summary, as kept in app_settings. */
export interface PeriodSummary {
  headline: string;
  /** Three short facts, each with figures from the input. */
  facts: string[];
  /** Budgeting advice based on what is left to spend. */
  tip: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** Checks a model answer (or a kept entry) and returns it as a summary, or null. */
export function toPeriodSummary(raw: unknown, createdAt: string): PeriodSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const headline = text(r.headline);
  const tip = text(r.tip);
  const facts = (Array.isArray(r.facts) ? r.facts : []).map(text).filter(Boolean).slice(0, 3);
  if (!headline || !tip || facts.length === 0) return null;
  return { headline, facts, tip, createdAt };
}
