import { db } from "@/db";
import { transactions, categories, budgetTargets, budgets } from "@/db/schema";
import { eq, and, gte, lte, asc, inArray, notInArray } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { reimbursedAmountExpr } from "@/lib/reimbursed-amount";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getBudgetStrategy, getBudgetRecurringMode, getSharedCostMode } from "@/lib/app-settings";
import { recurringCountsToward } from "@/lib/safe-to-spend";
import { currentFinancialMonth, financialMonthRangeByMonth, type FinancialMonthConfig } from "@/lib/date-range";
import { getBudgetIncome, type BudgetIncomeSource } from "@/lib/budget-income";

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

/** Per-category variable expense spend over [from,to], honoring splits and
 * internal-transfer exclusion. Spend is gross unless `netReimbursements` is set, in which
 * case the part others pay back is subtracted — see getSharedCostMode. Each category's spend is
 * split into `nonRecurring` and `recurring` (transactions matched to a recurring
 * bill/subscription) so the caller can decide whether recurring bills count toward the
 * budget — see getBudgetRecurringMode / resolveSpend in getBudgetOverview. Spend is keyed
 * by the category the transaction (or split) was actually assigned to — no parent rollup
 * here; callers that want a top-level category to also cover its sub-categories' spend do
 * that rollup themselves (see getBudgetOverview), since only they know which sub-categories
 * have their own budget and should therefore be excluded from the rollup. Spending
 * without a category is kept apart (`uncategorised`): an overall budget covers it. */
type CategorySpend = { nonRecurring: number; recurring: number };

async function variableSpend(from: string, to: string, variableIds: Set<number>, netReimbursements = false) {
  const periodRows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    reimbursedAmount: reimbursedAmountExpr,
    categoryId: transactions.categoryId,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
    recurringItemId: transactions.recurringItemId,
  }).from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  const recurringTxIds = new Set(periodRows.filter((r) => r.recurringItemId != null).map((r) => r.id));

  const splitRows = await getTransactionSplitRows(periodRows.map((r) => r.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(periodRows, splitMap, { netReimbursements });

  const byCategory = new Map<number, CategorySpend>();
  const uncategorised: CategorySpend = { nonRecurring: 0, recurring: 0 };
  for (const row of allocations) {
    if (row.direction !== "expense" || row.isInternalTransfer) continue;
    if (row.categoryId == null) {
      if (recurringTxIds.has(row.transactionId)) uncategorised.recurring += row.amount;
      else uncategorised.nonRecurring += row.amount;
      continue;
    }
    if (!variableIds.has(row.categoryId)) continue;
    const entry = byCategory.get(row.categoryId) ?? { nonRecurring: 0, recurring: 0 };
    if (recurringTxIds.has(row.transactionId)) entry.recurring += row.amount;
    else entry.nonRecurring += row.amount;
    byCategory.set(row.categoryId, entry);
  }
  return { byCategory, uncategorised };
}

export interface BudgetCategoryRow {
  categoryId: number;
  categoryName: string;
  color: string | null;
  icon: string | null;
  parentCategoryId: number | null; // null for a top-level category
  budgetType: string | null; // "nodig" | "willen" | "sparen" — Need / Want / Save
  budget: number | null; // category budget (default target), null if unset
  spent: number;         // spend this period — for a top-level category, includes any
                          // of its sub-categories that don't have their own budget set
  billsSpent: number;    // the part of `spent` that bills paid (recurring-matched), same rollup
  last30: number;        // spend over the trailing 30 days (creation hint), same rollup rule
}

export interface BudgetOverview {
  budget: { id: number; amount: number; period: BudgetPeriod } | null;
  from: string;
  to: string;
  daysLeft: number;
  totalSpent: number;      // variable spend this period, across ALL variable categories and uncategorised spending
  budgetedSpent: number;   // variable spend this period, only across categories that have a budget set
  billsSpent: number;      // the part of totalSpent that bills paid (recurring-matched transactions)
  budgetedBillsSpent: number; // the same part of budgetedSpent
  last30Total: number;     // trailing-30-day variable spend (creation hint, shown for monthly)
  last7Total: number;      // trailing-7-day variable spend (creation hint, shown for weekly)
  allocated: number;       // sum of category budgets
  /** Monthly income the budget is planned on (the strategy, the advised amount): the
   *  regular income from recurring income items, or — without any — what came in this
   *  financial month. `incomeSource` says which. See getBudgetIncome. */
  income: number;
  incomeSource: BudgetIncomeSource;
  strategy: { nodig: number; willen: number; sparen: number };
  categories: BudgetCategoryRow[];
}

/**
 * The budget for the current period, or — with `month` (a financial month, YYYY-MM) — for
 * that month. A weekly budget always shows the current week.
 */
export async function getBudgetOverview(financialMonth: FinancialMonthConfig, opts: { month?: string } = {}): Promise<BudgetOverview> {
  const month = opts.month ?? currentFinancialMonth(financialMonth);
  const [budgetRow] = await db.select().from(budgets).where(eq(budgets.active, true)).orderBy(asc(budgets.id)).limit(1);

  const period: BudgetPeriod = budgetRow?.period === "weekly" ? "weekly" : "monthly";
  // Monthly always tracks the app's financial month (no separate "start day" for the
  // budget) so it automatically follows any change to that setting; weekly is fixed
  // to Monday–Sunday. See src/lib/budget-overview.ts's WEEKLY_START_DOW.
  const { from, to } = period === "weekly"
    ? weeklyPeriodRange()
    : financialMonthRangeByMonth(month, financialMonth);

  const now = new Date();
  const todayStr = toDateStr(now);
  const last30From = toDateStr(new Date(now.getTime() - 29 * 86_400_000));
  const last7From = toDateStr(new Date(now.getTime() - 6 * 86_400_000));

  const [allExpenseCats, defaultTargetRows, strategy, recurringMode, sharedCostMode] = await Promise.all([
    // Money moved to savings or investments, and income categories, are never spending
    // against a budget, whatever budget type they carry.
    db
      .select()
      .from(categories)
      .where(and(inArray(categories.budgetType, [...VARIABLE_TYPES]), notInArray(categories.group, ["savings", "income"])))
      .orderBy(asc(categories.name)),
    db.select().from(budgetTargets).where(and(eq(budgetTargets.year, 0), eq(budgetTargets.month, 0))),
    getBudgetStrategy(),
    getBudgetRecurringMode(),
    getSharedCostMode(),
  ]);
  const netReimbursements = sharedCostMode === "net";

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
    variableSpend(from, to, variableIds, netReimbursements),
    variableSpend(last30From, todayStr, variableIds, netReimbursements),
    variableSpend(last7From, todayStr, variableIds, netReimbursements),
  ]);

  // The income the strategy and the advised amount are planned on: the regular monthly
  // income (recurring income items), else what came in this financial month. An earlier
  // month is read as of its last day, so items that ended since still count for it.
  const fmRange = financialMonthRangeByMonth(month, financialMonth);
  const { income, source: incomeSource } = await getBudgetIncome(fmRange, fmRange.to < todayStr ? fmRange.to : todayStr);

  const defaultMap = new Map(defaultTargetRows.map((t) => [t.categoryId, t.targetAmount]));
  const hasOverall = (budgetRow?.amount ?? 0) > 0;
  const parentOf = new Map(allExpenseCats.map((c) => [c.id, c.parentCategoryId]));

  // Resolve one category's raw {nonRecurring, recurring} spend into a single number,
  // applying the recurring-mode setting: recurring bills count toward the category
  // always, never, or only when it is budgeted — see recurringCountsToward.
  // `part` "bills" gives only the recurring part that counts (for the bill-aware pace).
  function resolveSpend(entry: CategorySpend | undefined, categoryId: number | null, part: "all" | "bills" = "all") {
    if (!entry) return 0;
    const budgeted = categoryId != null && (defaultMap.has(categoryId) || defaultMap.has(parentOf.get(categoryId) ?? -1));
    const bills = recurringCountsToward(recurringMode, hasOverall, budgeted) ? entry.recurring : 0;
    return part === "bills" ? bills : entry.nonRecurring + bills;
  }

  // A top-level category's spend rolls up any child that doesn't have its own budget
  // set — so an un-broken-out "Housing" budget still covers Rent, Utilities, etc.
  // Once a child gets its own saved budget, its spend is tracked on the child instead
  // (and dropped from the parent's rollup) so it isn't counted twice.
  function topLevelSpend(spend: { byCategory: Map<number, CategorySpend> }, parentId: number, part: "all" | "bills" = "all") {
    const own = resolveSpend(spend.byCategory.get(parentId), parentId, part);
    const children = childrenByParent.get(parentId) ?? [];
    const rolled = children
      .filter((c) => !defaultMap.has(c.id))
      .reduce((s, c) => s + resolveSpend(spend.byCategory.get(c.id), c.id, part), 0);
    return own + rolled;
  }

  // Flat resolved total across every variable category (no rollup, each counted once) —
  // feeds totalSpent and the trailing-window creation hints.
  function resolvedTotal(spend: { byCategory: Map<number, CategorySpend>; uncategorised: CategorySpend }, part: "all" | "bills" = "all") {
    let total = resolveSpend(spend.uncategorised, null, part);
    for (const [categoryId, entry] of spend.byCategory) total += resolveSpend(entry, categoryId, part);
    return total;
  }

  const categoryRows: BudgetCategoryRow[] = [
    ...topLevel.map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      color: cat.color ?? null,
      icon: cat.icon ?? null,
      parentCategoryId: null,
      budgetType: cat.budgetType ?? null,
      budget: defaultMap.get(cat.id) ?? null,
      spent: topLevelSpend(periodSpend, cat.id),
      billsSpent: topLevelSpend(periodSpend, cat.id, "bills"),
      last30: topLevelSpend(last30Spend, cat.id),
    })),
    ...subCats.map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      color: cat.color ?? null,
      icon: cat.icon ?? null,
      parentCategoryId: cat.parentCategoryId,
      budgetType: cat.budgetType ?? null,
      budget: defaultMap.get(cat.id) ?? null,
      spent: resolveSpend(periodSpend.byCategory.get(cat.id), cat.id),
      billsSpent: resolveSpend(periodSpend.byCategory.get(cat.id), cat.id, "bills"),
      last30: resolveSpend(last30Spend.byCategory.get(cat.id), cat.id),
    })),
  ];

  const allocated = categoryRows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const budgetedRows = categoryRows.filter((r) => r.budget != null && r.budget > 0);
  const budgetedSpent = budgetedRows.reduce((s, r) => s + r.spent, 0);

  return {
    budget: budgetRow ? { id: budgetRow.id, amount: budgetRow.amount, period } : null,
    from,
    to,
    daysLeft: daysBetweenInclusive(todayStr < from ? from : todayStr, to),
    totalSpent: resolvedTotal(periodSpend),
    budgetedSpent,
    billsSpent: resolvedTotal(periodSpend, "bills"),
    budgetedBillsSpent: budgetedRows.reduce((s, r) => s + r.billsSpent, 0),
    last30Total: resolvedTotal(last30Spend),
    last7Total: resolvedTotal(last7Spend),
    allocated,
    income,
    incomeSource,
    strategy,
    categories: categoryRows,
  };
}
