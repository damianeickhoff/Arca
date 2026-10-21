// Insights › Trends: the maths behind the page, kept free of the database so it can be
// tested on its own. The page (src/app/trends/trends-tab.tsx) loads the rows; this file
// turns them into months, averages, the needs / wants split, the biggest movers and the
// category table.
//
// Months are budget months, keyed YYYY-MM by the month they start in (lib/date-range).
// Averages count finished months only, so a running month doesn't drag them down.

import {
  financialMonthForDate,
  financialMonthRangeByMonth,
  offsetFinancialMonth,
  type FinancialMonthConfig,
} from "@/lib/date-range";
import { normalizeBudgetType } from "@/lib/format";

// ── Period ──────────────────────────────────────────────────────────────────

export const TRENDS_MONTH_COUNTS = [3, 6, 12] as const;
export type TrendsMonthCount = (typeof TRENDS_MONTH_COUNTS)[number];
export type TrendsRange = { kind: "months"; count: TrendsMonthCount } | { kind: "custom"; from: string; to: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The period from the URL: a `from`/`to` pair is a custom period (the 3 · 6 · 12 links
 * drop it, so it is only there when one was picked); otherwise `range=3|6|12` for the
 * last months. Anything else is 6 months.
 */
export function parseTrendsRange(sp: { range?: string | null; from?: string | null; to?: string | null }): TrendsRange {
  const { from, to } = sp;
  if (from && to && ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to) return { kind: "custom", from, to };
  const count = Number(sp.range);
  if ((TRENDS_MONTH_COUNTS as readonly number[]).includes(count)) return { kind: "months", count: count as TrendsMonthCount };
  return { kind: "months", count: 6 };
}

/**
 * The budget months [from,to] covers: every one that ends inside it, so a calendar
 * year is the twelve budget months named January … December. A range shorter than a
 * budget month falls back to the one `to` is in.
 */
export function budgetMonthsIn(from: string, to: string, financialMonth: FinancialMonthConfig): string[] {
  const last = financialMonthForDate(to, financialMonth);
  const months: string[] = [];
  for (let m = financialMonthForDate(from, financialMonth); m <= last; m = offsetFinancialMonth(m, 1)) {
    const end = financialMonthRangeByMonth(m, financialMonth).to;
    if (end >= from && end <= to) months.push(m);
  }
  return months.length > 0 ? months : [last];
}

/**
 * The months the page shows, oldest first: the last `count` up to and including the
 * current one, or a custom period's months up to the current one (months that haven't
 * started have nothing to show).
 */
export function trendsMonths(range: TrendsRange, current: string, financialMonth: FinancialMonthConfig): string[] {
  if (range.kind === "months") {
    return Array.from({ length: range.count }, (_, i) => offsetFinancialMonth(current, i - range.count + 1));
  }
  const months = budgetMonthsIn(range.from, range.to, financialMonth).filter((m) => m <= current);
  return months.length > 0 ? months : [current];
}

/** The `count` months just before `months` (as many as it holds by default). */
export function monthsBefore(months: string[], count = months.length): string[] {
  if (months.length === 0) return [];
  return Array.from({ length: count }, (_, i) => offsetFinancialMonth(months[0], i - count));
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface TrendsRow {
  /** Budget month the row falls in (YYYY-MM). */
  month: string;
  direction: string;
  amount: number;
  categoryId: number | null;
  /** categories.group: "income", "savings" or "" (spending). */
  categoryGroup: string | null;
  /** The transaction's own budget type override, else its category's. */
  budgetType: string | null;
  isReimbursement: boolean;
  isInternalTransfer: boolean;
}

export type RowKind = "income" | "needs" | "wants" | "saved";

/**
 * What a row counts as, with Home's rules: reimbursements and internal transfers left
 * out, money moved into savings categories saved rather than spent. Spending is a need
 * when its budget type says so; everything else (wants, nothing set) counts as wants.
 */
export function classifyRow(row: Pick<TrendsRow, "direction" | "categoryGroup" | "budgetType" | "isReimbursement" | "isInternalTransfer">): RowKind | null {
  if (row.isReimbursement || row.isInternalTransfer) return null;
  if (row.categoryGroup === "savings") return row.direction === "expense" ? "saved" : null;
  if (row.direction === "income") return "income";
  return normalizeBudgetType(row.budgetType) === "nodig" ? "needs" : "wants";
}

export interface MonthFlow {
  month: string;
  income: number;
  needs: number;
  wants: number;
  saved: number;
  /** needs + wants. */
  expense: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** Money in and out per month, for every month asked for (zeros where nothing moved). */
export function monthFlows(rows: TrendsRow[], months: string[]): MonthFlow[] {
  const byMonth = new Map(months.map((m) => [m, { month: m, income: 0, needs: 0, wants: 0, saved: 0, expense: 0 }]));
  for (const row of rows) {
    const flow = byMonth.get(row.month);
    const kind = classifyRow(row);
    if (!flow || !kind) continue;
    flow[kind] += row.amount;
  }
  return months.map((m) => {
    const f = byMonth.get(m)!;
    return { month: m, income: cents(f.income), needs: cents(f.needs), wants: cents(f.wants), saved: cents(f.saved), expense: cents(f.needs + f.wants) };
  });
}

/** Whether anything moved in a month. */
export function hasData(f: MonthFlow): boolean {
  return f.income > 0 || f.expense > 0 || f.saved > 0;
}

/**
 * The months from the first one with data on, so a period reaching back before the
 * first import doesn't average in empty months. All of them when none has data.
 */
export function fromFirstData(flows: MonthFlow[]): MonthFlow[] {
  const first = flows.findIndex(hasData);
  return first <= 0 ? flows : flows.slice(first);
}

/** Spending per category per month (needs and wants only), for the months asked for. */
export function categoryMonthly(rows: TrendsRow[], months: string[]): Map<number, Record<string, number>> {
  const wanted = new Set(months);
  const out = new Map<number, Record<string, number>>();
  for (const row of rows) {
    if (row.categoryId == null || !wanted.has(row.month)) continue;
    const kind = classifyRow(row);
    if (kind !== "needs" && kind !== "wants") continue;
    const monthly = out.get(row.categoryId) ?? {};
    monthly[row.month] = cents((monthly[row.month] ?? 0) + row.amount);
    out.set(row.categoryId, monthly);
  }
  return out;
}

// ── Key figures ─────────────────────────────────────────────────────────────

export interface KeptSummary {
  /** The months the averages are taken over: the finished ones (all, if none finished). */
  basis: MonthFlow[];
  avgIncome: number;
  avgExpense: number;
  /** avgIncome − avgExpense. */
  kept: number;
  /** Finished months that ended above zero, and how many finished. */
  positive: number;
  finished: number;
  peakIncome: MonthFlow | null;
  peakExpense: MonthFlow | null;
}

export function keptSummary(flows: MonthFlow[], runningMonth: string | null): KeptSummary {
  const finished = flows.filter((f) => f.month !== runningMonth);
  const basis = finished.length > 0 ? finished : flows;
  const n = Math.max(1, basis.length);
  const avgIncome = cents(basis.reduce((s, f) => s + f.income, 0) / n);
  const avgExpense = cents(basis.reduce((s, f) => s + f.expense, 0) / n);
  const peak = (key: "income" | "expense") =>
    basis.reduce<MonthFlow | null>((best, f) => (f[key] > 0 && (!best || f[key] > best[key]) ? f : best), null);
  return {
    basis,
    avgIncome,
    avgExpense,
    kept: cents(avgIncome - avgExpense),
    positive: finished.filter((f) => f.income - f.expense > 0).length,
    finished: finished.length,
    peakIncome: peak("income"),
    peakExpense: peak("expense"),
  };
}

/**
 * Whether the highest income month stands out from the rest (holiday pay, a bonus):
 * at least a quarter above the median of the months. Then the page names what made it.
 */
export function incomeStandsOut(basis: MonthFlow[], peak: MonthFlow | null): boolean {
  if (!peak || basis.length < 3) return false;
  const sorted = basis.map((f) => f.income).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median > 0 && peak.income >= median * 1.25;
}

export interface PlanSplit {
  needs: number;
  wants: number;
  savings: number;
  needsOk: boolean;
  wantsOk: boolean;
  savingsOk: boolean;
}

/** Needs, wants and savings as whole percentages of income, against the plan's targets.
 *  Null without income to divide by. */
export function planSplit(basis: MonthFlow[], strategy: { nodig: number; willen: number; sparen: number }): PlanSplit | null {
  const income = basis.reduce((s, f) => s + f.income, 0);
  if (income <= 0) return null;
  const pct = (v: number) => Math.round((v / income) * 100);
  const needs = pct(basis.reduce((s, f) => s + f.needs, 0));
  const wants = pct(basis.reduce((s, f) => s + f.wants, 0));
  const savings = pct(basis.reduce((s, f) => s + f.saved, 0));
  return { needs, wants, savings, needsOk: needs <= strategy.nodig, wantsOk: wants <= strategy.willen, savingsOk: savings >= strategy.sparen };
}

// ── Biggest movers ──────────────────────────────────────────────────────────

export interface MoverInput {
  id: number;
  name: string;
  /** Per month in the period (finished months). */
  after: number;
  /** Per month in the months before it. */
  before: number;
}

export interface Mover extends MoverInput {
  delta: number;
}

/**
 * The categories whose spending per month changed most against the months before,
 * both ways, largest first. Changes under `min` are noise and left out. `net` is the
 * change over every category, the movers or not.
 */
export function biggestMovers(items: MoverInput[], { limit = 3, min = 5 }: { limit?: number; min?: number } = {}) {
  const withDelta = items.map((i) => ({ ...i, delta: cents(i.after - i.before) }));
  const up = withDelta.filter((i) => i.delta >= min).sort((a, b) => b.delta - a.delta).slice(0, limit);
  const down = withDelta.filter((i) => i.delta <= -min).sort((a, b) => a.delta - b.delta).slice(0, limit);
  const net = cents(withDelta.reduce((s, i) => s + i.delta, 0));
  return { up, down, net };
}

/** The merchant behind at least `share` of a total ("mostly Albert Heijn"), or null. */
export function dominantMerchant(entries: { merchant: string | null; amount: number }[], share = 0.5): string | null {
  const total = entries.reduce((s, e) => s + e.amount, 0);
  if (total <= 0) return null;
  const byName = new Map<string, number>();
  for (const e of entries) if (e.merchant) byName.set(e.merchant, (byName.get(e.merchant) ?? 0) + e.amount);
  let best: [string, number] | null = null;
  for (const entry of byName) if (!best || entry[1] > best[1]) best = entry;
  return best && best[1] / total >= share ? best[0] : null;
}

// ── Category table ──────────────────────────────────────────────────────────

export interface CategoryTrend {
  /** One value per shown month, oldest first. */
  values: number[];
  total: number;
  /** Per finished month. */
  avg: number;
  /** The running month's amount so far, or null when every month has finished. */
  current: number | null;
  /** avg minus the average of the months before. */
  vsBefore: number;
  /** The running month is already far above the average (orange in the table). */
  spike: boolean;
}

export function categoryTrend(
  monthly: Record<string, number>,
  months: string[],
  runningMonth: string | null,
  beforeTotal: number,
  beforeCount: number,
): CategoryTrend {
  const values = months.map((m) => monthly[m] ?? 0);
  const finished = months.filter((m) => m !== runningMonth);
  const basis = finished.length > 0 ? finished : months;
  const avg = cents(basis.reduce((s, m) => s + (monthly[m] ?? 0), 0) / Math.max(1, basis.length));
  const current = runningMonth && months.includes(runningMonth) ? (monthly[runningMonth] ?? 0) : null;
  const beforeAvg = beforeCount > 0 ? beforeTotal / beforeCount : 0;
  return {
    values,
    total: cents(values.reduce((s, v) => s + v, 0)),
    avg,
    current,
    vsBefore: cents(avg - beforeAvg),
    spike: current != null && current > avg * 1.5 && current - avg >= 20,
  };
}

/** How a change against the months before reads: the same (under €5 either way), up or down. */
export function changeTone(delta: number): "same" | "up" | "down" {
  return Math.abs(delta) < 5 ? "same" : delta > 0 ? "up" : "down";
}
