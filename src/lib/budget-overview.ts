import { db } from "@/db";
import { transactions, categories, budgetTargets, budgets } from "@/db/schema";
import { eq, and, gte, lte, sql, asc, inArray } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getBudgetStrategy } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth, type FinancialMonthConfig } from "@/lib/date-range";

const DEFAULT_BUDGET_MONTH = "0000-00";
const VARIABLE_TYPES = ["nodig", "willen", "sparen"] as const;

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetweenInclusive(fromStr: string, toStr: string) {
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

export type BudgetPeriod = "weekly" | "monthly";

// Weekly budgets always start on Monday — there's no user-facing "start day" control;
// monthly budgets instead always follow the app's financial-month start day (see
// getBudgetOverview), so this constant only ever applies to the weekly period.
const WEEKLY_START_DOW = 1;

/** The [from,to] date range of the current weekly budget period (always Monday–Sunday). */
function weeklyPeriodRange(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (from.getDay() !== WEEKLY_START_DOW) from.setDate(from.getDate() - 1);
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from: toDateStr(from), to: toDateStr(to) };
}

/** Per-category variable expense spend over [from,to], honoring splits, reimbursements,
 * and internal-transfer exclusion. Transactions matched to a recurring bill/subscription
 * are excluded entirely — a recurring bill isn't something you can budget down this
 * month, so it shouldn't eat into the variable-spend budget. Spend is keyed by the
 * category the transaction (or split) was actually assigned to — no parent rollup here;
 * callers that want a top-level category to also cover its sub-categories' spend do that
 * rollup themselves (see getBudgetOverview), since only they know which sub-categories
 * have their own budget and should therefore be excluded from the rollup. */
async function variableSpend(from: string, to: string, variableIds: Set<number>) {
  const periodRows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    reimbursedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id}), 0)`,
    categoryId: transactions.categoryId,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
    recurringItemId: transactions.recurringItemId,
  }).from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  const nonRecurringRows = periodRows.filter((r) => r.recurringItemId == null);

  const splitRows = await getTransactionSplitRows(nonRecurringRows.map((r) => r.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(nonRecurringRows, splitMap, { netto: false });

  const byCategory = new Map<number, number>();
  let total = 0;
  for (const row of allocations) {
    if (row.direction !== "expense" || row.isInternalTransfer || row.categoryId == null) continue;
    if (!variableIds.has(row.categoryId)) continue;
    byCategory.set(row.categoryId, (byCategory.get(row.categoryId) ?? 0) + row.amount);
    total += row.amount;
  }
  return { total, byCategory };
}

export interface BudgetCategoryRow {
  categoryId: number;
  categoryName: string;
  color: string | null;
  icon: string | null;
  parentCategoryId: number | null; // null for a top-level category
  budget: number | null; // category budget (default target), null if unset
  spent: number;         // spend this period — for a top-level category, includes any
                          // of its sub-categories that don't have their own budget set
  last30: number;        // spend over the trailing 30 days (creation hint), same rollup rule
}

export interface BudgetOverview {
  budget: { id: number; amount: number; period: BudgetPeriod } | null;
  from: string;
  to: string;
  daysLeft: number;
  totalSpent: number;      // variable spend this period, across ALL variable categories
  budgetedSpent: number;   // variable spend this period, only across categories that have a budget set
  last30Total: number;     // trailing-30-day variable spend (creation hint, shown for monthly)
  last7Total: number;      // trailing-7-day variable spend (creation hint, shown for weekly)
  allocated: number;       // sum of category budgets
  income: number;          // current financial-month income (for the advised amount)
  strategy: { nodig: number; willen: number; sparen: number };
  categories: BudgetCategoryRow[];
}

export async function getBudgetOverview(financialMonth: FinancialMonthConfig): Promise<BudgetOverview> {
  const [budgetRow] = await db.select().from(budgets).where(eq(budgets.active, true)).orderBy(asc(budgets.id)).limit(1);

  const period: BudgetPeriod = budgetRow?.period === "weekly" ? "weekly" : "monthly";
  // Monthly always tracks the app's financial month (no separate "start day" for the
  // budget) so it automatically follows any change to that setting; weekly is fixed
  // to Monday–Sunday. See src/lib/budget-overview.ts's WEEKLY_START_DOW.
  const { from, to } = period === "weekly"
    ? weeklyPeriodRange()
    : financialMonthRangeByMonth(currentFinancialMonth(financialMonth), financialMonth);

  const now = new Date();
  const todayStr = toDateStr(now);
  const last30From = toDateStr(new Date(now.getTime() - 29 * 86_400_000));
  const last7From = toDateStr(new Date(now.getTime() - 6 * 86_400_000));

  const [allExpenseCats, defaultTargetRows, strategy] = await Promise.all([
    db.select().from(categories).where(inArray(categories.budgetType, [...VARIABLE_TYPES])).orderBy(asc(categories.name)),
    db.select().from(budgetTargets).where(and(eq(budgetTargets.year, 0), eq(budgetTargets.month, 0))),
    getBudgetStrategy(),
  ]);

  const variableIds = new Set(allExpenseCats.map((c) => c.id));
  const topLevel = allExpenseCats.filter((c) => c.parentCategoryId === null);
  const subCats = allExpenseCats.filter((c) => c.parentCategoryId !== null);
  const childrenByParent = new Map<number, typeof subCats>();
  for (const c of subCats) {
    const arr = childrenByParent.get(c.parentCategoryId!) ?? [];
    arr.push(c);
    childrenByParent.set(c.parentCategoryId!, arr);
  }

  const [periodSpend, last30Spend, last7Spend] = await Promise.all([
    variableSpend(from, to, variableIds),
    variableSpend(last30From, todayStr, variableIds),
    variableSpend(last7From, todayStr, variableIds),
  ]);

  // Current financial-month income — used to compute the strategy-based advised amount.
  const fmRange = financialMonthRangeByMonth(currentFinancialMonth(financialMonth), financialMonth);
  const incomeRows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    reimbursedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id}), 0)`,
    categoryId: transactions.categoryId,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
  }).from(transactions)
    .where(and(gte(transactions.date, fmRange.from), lte(transactions.date, fmRange.to), eq(transactions.direction, "income")));
  const incomeSplitRows = await getTransactionSplitRows(incomeRows.map((r) => r.id));
  const incomeAlloc = buildSplitAllocations(incomeRows, groupTransactionSplits(incomeSplitRows), { netto: false });
  const income = incomeAlloc
    .filter((row) => row.direction === "income" && !row.isReimbursement && !row.isInternalTransfer)
    .reduce((s, row) => s + row.amount, 0);

  const defaultMap = new Map(defaultTargetRows.map((t) => [t.categoryId, t.targetAmount]));

  // A top-level category's spend rolls up any child that doesn't have its own budget
  // set — so an un-broken-out "Housing" budget still covers Rent, Utilities, etc.
  // Once a child gets its own saved budget, its spend is tracked on the child instead
  // (and dropped from the parent's rollup) so it isn't counted twice.
  function topLevelSpend(spend: { byCategory: Map<number, number> }, parentId: number) {
    const own = spend.byCategory.get(parentId) ?? 0;
    const children = childrenByParent.get(parentId) ?? [];
    const rolled = children
      .filter((c) => !defaultMap.has(c.id))
      .reduce((s, c) => s + (spend.byCategory.get(c.id) ?? 0), 0);
    return own + rolled;
  }

  const categoryRows: BudgetCategoryRow[] = [
    ...topLevel.map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      color: cat.color ?? null,
      icon: cat.icon ?? null,
      parentCategoryId: null,
      budget: defaultMap.get(cat.id) ?? null,
      spent: topLevelSpend(periodSpend, cat.id),
      last30: topLevelSpend(last30Spend, cat.id),
    })),
    ...subCats.map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      color: cat.color ?? null,
      icon: cat.icon ?? null,
      parentCategoryId: cat.parentCategoryId,
      budget: defaultMap.get(cat.id) ?? null,
      spent: periodSpend.byCategory.get(cat.id) ?? 0,
      last30: last30Spend.byCategory.get(cat.id) ?? 0,
    })),
  ];

  const allocated = categoryRows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const budgetedSpent = categoryRows
    .filter((r) => r.budget != null && r.budget > 0)
    .reduce((s, r) => s + r.spent, 0);

  return {
    budget: budgetRow ? { id: budgetRow.id, amount: budgetRow.amount, period } : null,
    from,
    to,
    daysLeft: daysBetweenInclusive(todayStr < from ? from : todayStr, to),
    totalSpent: periodSpend.total,
    budgetedSpent,
    last30Total: last30Spend.total,
    last7Total: last7Spend.total,
    allocated,
    income,
    strategy,
    categories: categoryRows,
  };
}
