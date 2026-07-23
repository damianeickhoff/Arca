import { db } from "@/db";
import { transactions, categories, budgetTargets } from "@/db/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";

const DEFAULT_BUDGET_MONTH_YEAR = 0;
const DEFAULT_BUDGET_MONTH_MONTH = 0;

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetweenInclusive(fromStr: string, toStr: string) {
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

function eachDate(fromStr: string, toStr: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${fromStr}T00:00:00`);
  const end = new Date(`${toStr}T00:00:00`);
  while (cur <= end) {
    out.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function shiftDateStr(d: string, days: number) {
  const dt = new Date(`${d}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return toDateStr(dt);
}

function mondayOfStr(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return toDateStr(dt);
}

function shiftMonthStr(monthStart: string, months: number) {
  const [y, m] = monthStart.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, 1);
  return toDateStr(dt);
}

export type BucketUnit = "day" | "week" | "month";

export interface CategoryDetailTransaction {
  id: number;
  date: string;
  amount: number;
  account: string | null;
  name: string;
}

export interface CategorySpendPoint {
  date: string;
  actual: number | null;
  forecast: number | null;
}

export interface CategoryDetail {
  categoryId: number;
  categoryName: string;
  color: string | null;
  icon: string | null;
  from: string;
  to: string;
  spent: number;
  budget: number | null; // scaled to [from,to] — see refDays
  forecast: number | null; // null when there's no spend yet to extrapolate from
  chart: CategorySpendPoint[];
  avgChart: { key: string; amount: number }[] | null; // always exactly 6 buckets, independent of [from,to] — see getAvgChartBuckets
  transactions: CategoryDetailTransaction[];
  avgPerWeek: number | null;
  popularDay: { weekday: number; amounts: number[] } | null; // weekday: 0=Mon..6=Sun, amounts = total spend per weekday
  biggestSpent: number | null;
  excludeFromSpendingRow: boolean;
}

/** Per-category (rolled up to include children) variable-expense spend, honoring
 * splits, reimbursements, and internal-transfer exclusion — mirrors variableSpend()
 * in budget-overview.ts but scoped to a single category and returning per-transaction
 * allocations instead of just totals, since the detail page needs the raw list too. */
async function categoryAllocations(from: string, to: string, categoryIds: number[], direction: "income" | "expense" = "expense") {
  const rows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    reimbursedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id}), 0)`,
    categoryId: transactions.categoryId,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
    account: transactions.account,
  }).from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  const splitRows = await getTransactionSplitRows(rows.map((r) => r.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(rows, splitMap, { netto: false });
  const accountById = new Map(rows.map((r) => [r.id, r.account]));

  const idSet = new Set(categoryIds);
  return allocations
    .filter((row) => row.direction === direction && !row.isInternalTransfer && row.categoryId != null && idSet.has(row.categoryId))
    .map((row) => ({ ...row, account: accountById.get(row.transactionId) ?? null }));
}

/** Always exactly 6 buckets ending at `endDateRaw` (clamped to today, so no empty
 * future buckets), independent of the selected [from,to] — a short period (e.g. one
 * week bucketed daily) would otherwise only ever produce as many buckets as it has
 * days, so this widens the query window backward as needed to always fill 6. Buckets
 * with no spend simply come back as 0 (e.g. a category that didn't exist yet). */
async function getAvgChartBuckets(categoryIds: number[], unit: BucketUnit, endDateRaw: string, direction: "income" | "expense" = "expense"): Promise<{ key: string; amount: number }[]> {
  const todayStr = toDateStr(new Date());
  const end = endDateRaw > todayStr ? todayStr : endDateRaw;

  let rangeStart: string;
  let bucketKeys: string[];
  let keyOf: (date: string) => string;

  if (unit === "day") {
    rangeStart = shiftDateStr(end, -5);
    bucketKeys = eachDate(rangeStart, end);
    keyOf = (d) => d;
  } else if (unit === "week") {
    const endMonday = mondayOfStr(end);
    rangeStart = shiftDateStr(endMonday, -5 * 7);
    bucketKeys = Array.from({ length: 6 }, (_, i) => shiftDateStr(endMonday, -(5 - i) * 7));
    keyOf = mondayOfStr;
  } else {
    const endMonthStart = `${end.slice(0, 7)}-01`;
    rangeStart = shiftMonthStr(endMonthStart, -5);
    bucketKeys = Array.from({ length: 6 }, (_, i) => shiftMonthStr(endMonthStart, -(5 - i)).slice(0, 7));
    keyOf = (d) => d.slice(0, 7);
  }

  const allocations = await categoryAllocations(rangeStart, end, categoryIds, direction);
  const totals = new Map<string, number>();
  for (const a of allocations) totals.set(keyOf(a.date), (totals.get(keyOf(a.date)) ?? 0) + a.amount);

  return bucketKeys.map((key) => ({ key, amount: totals.get(key) ?? 0 }));
}

/** Scoped, period-filtered detail for a single category — spend total, cumulative
 * daily series (actual + forecast), the transaction list, and (when there's enough
 * data) avg/popular-day/biggest-spend insight stats.
 *
 * `refDays` is the length in days of the app's actual budget period (7 for weekly,
 * the financial-month length for monthly) — the category's stored budget target is
 * period-agnostic, so it's scaled by (range length / refDays) to show a sensible
 * limit for periods other than "Budget period" itself. */
export async function getCategoryDetail(categoryId: number, from: string, to: string, refDays: number, avgUnit: BucketUnit = "week", direction: "income" | "expense" = "expense"): Promise<CategoryDetail | null> {
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!category) return null;

  const children = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentCategoryId, categoryId));
  const categoryIds = [categoryId, ...children.map((c) => c.id)];

  const [allocations, [targetRow]] = await Promise.all([
    categoryAllocations(from, to, categoryIds, direction),
    db.select().from(budgetTargets).where(and(
      eq(budgetTargets.year, DEFAULT_BUDGET_MONTH_YEAR),
      eq(budgetTargets.month, DEFAULT_BUDGET_MONTH_MONTH),
      inArray(budgetTargets.categoryId, categoryIds),
    )),
  ]);

  const spent = allocations.reduce((s, a) => s + a.amount, 0);

  const rangeDays = daysBetweenInclusive(from, to);
  const rawBudget = targetRow?.targetAmount ?? null;
  const budget = rawBudget != null ? rawBudget * (rangeDays / Math.max(1, refDays)) : null;

  // ── Chart: cumulative actual spend up to "today" (clamped into range), then a
  // dashed straight-line forecast from that point to a linear projection at `to`. ──
  const dates = eachDate(from, to);
  const todayStr = toDateStr(new Date());
  const lastActualDate = todayStr < from ? null : (todayStr > to ? to : todayStr);

  const byDate = new Map<string, number>();
  for (const a of allocations) byDate.set(a.date, (byDate.get(a.date) ?? 0) + a.amount);

  let running = 0;
  const cumulativeByDate = new Map<string, number>();
  for (const d of dates) {
    running += byDate.get(d) ?? 0;
    cumulativeByDate.set(d, running);
  }

  const spentThroughLastActual = lastActualDate ? (cumulativeByDate.get(lastActualDate) ?? 0) : 0;
  const elapsedDays = lastActualDate ? daysBetweenInclusive(from, lastActualDate) : 0;
  const forecastTotal = elapsedDays > 0 ? (spentThroughLastActual / elapsedDays) * rangeDays : null;

  const chart: CategorySpendPoint[] = dates.map((d) => {
    const isActual = lastActualDate != null && d <= lastActualDate;
    const actual = isActual ? (cumulativeByDate.get(d) ?? 0) : null;
    let forecast: number | null = null;
    if (forecastTotal != null && lastActualDate != null && d >= lastActualDate) {
      const totalSpan = daysBetweenInclusive(lastActualDate, to);
      const stepsIn = daysBetweenInclusive(lastActualDate, d);
      forecast = totalSpan <= 1 ? forecastTotal : spentThroughLastActual + ((forecastTotal - spentThroughLastActual) * (stepsIn - 1)) / (totalSpan - 1);
    }
    return { date: d, actual, forecast };
  });

  // ── Transaction list, newest first ──
  const txList: CategoryDetailTransaction[] = allocations
    .map((a) => ({ id: a.transactionId, date: a.date, amount: a.amount, account: a.account, name: a.categoryName ?? category.name }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

  // ── Insight stats — only meaningful with enough transactions ──
  let avgPerWeek: number | null = null;
  let popularDay: { weekday: number; amounts: number[] } | null = null;
  let biggestSpent: number | null = null;

  if (txList.length >= 4) {
    avgPerWeek = spent / Math.max(1, rangeDays / 7);
    biggestSpent = Math.max(...txList.map((t) => t.amount));
    const amounts = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
    for (const t of txList) {
      const dow = new Date(`${t.date}T00:00:00`).getDay(); // 0=Sun..6=Sat
      amounts[dow === 0 ? 6 : dow - 1] += t.amount;
    }
    const weekday = amounts.indexOf(Math.max(...amounts));
    popularDay = { weekday, amounts };
  }

  const avgChart = txList.length >= 4 ? await getAvgChartBuckets(categoryIds, avgUnit, to, direction) : null;

  return {
    categoryId: category.id,
    categoryName: category.name,
    color: category.color,
    icon: category.icon,
    from,
    to,
    spent,
    budget,
    forecast: forecastTotal,
    chart,
    avgChart,
    transactions: txList,
    avgPerWeek,
    popularDay,
    biggestSpent,
    excludeFromSpendingRow: category.excludeFromSpendingRow,
  };
}
