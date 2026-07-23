import { db } from "@/db";
import { transactions, categories, budgetTargets } from "@/db/schema";
import { eq, and, gte, lte, sql, asc, inArray } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { currentFinancialMonth, financialMonthRangeByMonth, offsetFinancialMonth, type FinancialMonthConfig } from "@/lib/date-range";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Per-day spend for each budget bucket (nodig/willen/sparen), for the last N days within the
 * selected financial month — drives the small heatmap on the income card. */
export function getDailyBucketSplit(
  allocations: { date: string; direction: string; amount: number; isInternalTransfer: boolean; categoryId: number | null }[],
  catBudgetTypeById: Map<number, string | null>,
  rangeStart: string,
  rangeEnd: string,
  days = 7,
) {
  const todayStr = toDateStr(new Date());
  const lastDay = rangeEnd < todayStr ? rangeEnd : todayStr;
  const columns: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(`${lastDay}T12:00:00`);
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    if (ds >= rangeStart && ds <= rangeEnd) columns.push(ds);
  }

  const perDay = new Map<string, Record<string, number>>(columns.map((d) => [d, {}]));
  for (const row of allocations) {
    if (row.direction !== "expense" || row.isInternalTransfer) continue;
    if (!perDay.has(row.date) || row.categoryId == null) continue;
    const bucket = catBudgetTypeById.get(row.categoryId);
    if (!bucket) continue;
    const dayMap = perDay.get(row.date)!;
    dayMap[bucket] = (dayMap[bucket] ?? 0) + row.amount;
  }

  return columns.map((date) => ({ date, byBucket: perDay.get(date)! }));
}

export async function getBudgetData(
  month: string,
  financialMonth: FinancialMonthConfig | { defaultStartDay: number } = { defaultStartDay: 1 },
  rolloverEnabled = false,
) {
  const { from: start, to: end } = financialMonthRangeByMonth(month, financialMonth);

  const [periodRows, allVariableCats, allExpenseCats] = await Promise.all([
    db.select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      reimbursedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id}), 0)`,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryGroup: categories.group,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    }).from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, start), lte(transactions.date, end))),
    db.select().from(categories)
      .where(inArray(categories.budgetType, ["nodig", "willen", "sparen"]))
      .orderBy(asc(categories.name)),
    db.select().from(categories)
      .where(inArray(categories.budgetType, ["nodig", "willen", "sparen"])),
  ]);

  const splitRows = await getTransactionSplitRows(periodRows.map((row) => row.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(periodRows, splitMap);

  // A sub-category's spend counts towards its parent, so the parent's row shows the sum
  // of itself plus all its children and only top-level categories get their own row.
  const catById = new Map(allExpenseCats.map((c) => [c.id, c]));
  const rollupId = (id: number) => catById.get(id)?.parentCategoryId ?? id;

  const income = allocations
    .filter((row) => row.direction === "income" && !row.isReimbursement && !row.isInternalTransfer)
    .reduce((sum, row) => sum + row.amount, 0);

  // Full spending map (all expense categories) — used for bucket totals
  const allExpenseCatIds = new Set(allExpenseCats.map((c) => c.id));
  const fullSpendingMap = new Map(
    allocations
      .filter((row) => row.direction === "expense" && !row.isInternalTransfer && row.categoryId != null && allExpenseCatIds.has(row.categoryId))
      .reduce((map, row) => {
        map.set(row.categoryId!, (map.get(row.categoryId!) ?? 0) + row.amount);
        return map;
      }, new Map<number, number>()),
  );

  // Variable-only spending map — used for "Per category" table
  const variableCatIds = new Set(allVariableCats.map((c) => c.id));
  const spendingMap = new Map(
    allocations
      .filter((row) => row.direction === "expense" && !row.isInternalTransfer && row.categoryId != null && variableCatIds.has(row.categoryId))
      .reduce((map, row) => {
        const cid = rollupId(row.categoryId!);
        map.set(cid, (map.get(cid) ?? 0) + row.amount);
        return map;
      }, new Map<number, number>()),
  );

  // Budget targets for this month + defaults (year=0, month=0)
  const [y, m] = month.split("-").map(Number);
  const [monthTargetRows, defaultTargetRows] = await Promise.all([
    db.select().from(budgetTargets).where(and(eq(budgetTargets.year, y), eq(budgetTargets.month, m))),
    db.select().from(budgetTargets).where(and(eq(budgetTargets.year, 0), eq(budgetTargets.month, 0))),
  ]);
  const defaultMap = new Map(defaultTargetRows.map((t) => [t.categoryId, t.targetAmount]));
  const overrideMap = new Map(monthTargetRows.map((t) => [t.categoryId, t.targetAmount]));
  // Month-specific wins; default fills the rest
  const targetMap = new Map([...defaultMap, ...overrideMap]);

  // Rollover: unused budget from last month adds to this month's target, one month of
  // lookback only (no compounding chains across multiple months — a category that
  // underspends every month would otherwise accumulate an ever-growing rollover, which
  // gets confusing fast and masks whether the target itself is just set too high).
  const rolloverMap = new Map<number, number>();
  if (rolloverEnabled) {
    const prevMonth = offsetFinancialMonth(month, -1);
    const { from: prevStart, to: prevEnd } = financialMonthRangeByMonth(prevMonth, financialMonth);
    const [prevYear, prevMonthNum] = prevMonth.split("-").map(Number);

    const [prevMonthTargetRows, prevPeriodRows] = await Promise.all([
      db.select().from(budgetTargets).where(and(eq(budgetTargets.year, prevYear), eq(budgetTargets.month, prevMonthNum))),
      db.select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        reimbursedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id}), 0)`,
        categoryId: transactions.categoryId,
        categoryGroup: categories.group,
        isReimbursement: transactions.isReimbursement,
        isInternalTransfer: isInternalTransferExpr,
      }).from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(gte(transactions.date, prevStart), lte(transactions.date, prevEnd))),
    ]);

    const prevOverrideMap = new Map(prevMonthTargetRows.map((t) => [t.categoryId, t.targetAmount]));
    const prevTargetMap = new Map([...defaultMap, ...prevOverrideMap]);

    const prevSplitRows = await getTransactionSplitRows(prevPeriodRows.map((row) => row.id));
    const prevSplitMap = groupTransactionSplits(prevSplitRows);
    const prevAllocations = buildSplitAllocations(prevPeriodRows, prevSplitMap);
    const prevSpendingMap = new Map(
      prevAllocations
        .filter((row) => row.direction === "expense" && !row.isInternalTransfer && row.categoryId != null && variableCatIds.has(row.categoryId))
        .reduce((map, row) => {
          const cid = rollupId(row.categoryId!);
          map.set(cid, (map.get(cid) ?? 0) + row.amount);
          return map;
        }, new Map<number, number>()),
    );

    for (const [categoryId, prevTarget] of prevTargetMap) {
      if (categoryId == null || prevTarget == null || prevTarget <= 0) continue;
      const prevActual = prevSpendingMap.get(categoryId) ?? 0;
      const unused = Math.max(0, prevTarget - prevActual);
      if (unused > 0) rolloverMap.set(categoryId, unused);
    }
  }

  // Merge all variable categories with actual spending (for "Per category" table).
  // Only top-level categories get a row; children are already rolled into their parent.
  const catRows = allVariableCats.filter((cat) => cat.parentCategoryId === null).map((cat) => {
    const target = targetMap.get(cat.id) ?? null;
    const rollover = rolloverMap.get(cat.id) ?? 0;
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      budgetType: cat.budgetType ?? null,
      color: cat.color ?? null,
      icon: cat.icon ?? null,
      actual: spendingMap.get(cat.id) ?? 0,
      target,
      rollover,
      effectiveTarget: target != null ? target + rollover : null,
      isOverridden: overrideMap.has(cat.id) && defaultMap.has(cat.id) && overrideMap.get(cat.id) !== defaultMap.get(cat.id),
      hasDefault: defaultMap.has(cat.id),
    };
  });

  // Compute byBudgetType from ALL expense categories (bills, subscriptions, debts, savings, variable)
  const byBudgetType: Record<string, number> = {};
  for (const cat of allExpenseCats) {
    const spent = fullSpendingMap.get(cat.id) ?? 0;
    if (spent > 0 && cat.budgetType) {
      byBudgetType[cat.budgetType] = (byBudgetType[cat.budgetType] ?? 0) + spent;
    }
  }

  const catBudgetTypeById = new Map(allExpenseCats.map((cat) => [cat.id, cat.budgetType]));
  const dailySplit = getDailyBucketSplit(allocations, catBudgetTypeById, start, end);

  return { income, byBudgetType, targetRows: catRows, dailySplit, month };
}

// Convenience for callers that only need "left to spend this month" (e.g. the goals
// page's budget-filter card) without the rest of getBudgetData's per-category detail.
export async function getLeftThisMonth(financialMonth: FinancialMonthConfig, rolloverEnabled = false) {
  const month = currentFinancialMonth(financialMonth);
  const data = await getBudgetData(month, financialMonth, rolloverEnabled);

  const targetedRows = data.targetRows.filter((r) => r.target != null && r.target > 0);
  const totalTarget = targetedRows.reduce((s, r) => s + (r.effectiveTarget ?? r.target!), 0);
  const totalSpentOnTargets = targetedRows.reduce((s, r) => s + r.actual, 0);
  const totalLeft = totalTarget - totalSpentOnTargets;
  const rawTotalPct = totalTarget > 0 ? (totalSpentOnTargets / totalTarget) * 100 : 0;
  const totalPct = Math.min(100, rawTotalPct);
  const totalOver = totalLeft < 0 && totalTarget > 0;

  return { totalTarget, totalSpentOnTargets, totalLeft, rawTotalPct, totalPct, totalOver };
}
