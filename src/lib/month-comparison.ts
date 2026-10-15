import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { currentFinancialMonth, financialMonthRange, financialMonthRangeByMonth, offsetFinancialMonth, type FinancialMonthConfig } from "@/lib/date-range";

// Last completed financial month vs. the one before it — the source for the
// "Totale uitgaven trend" / "Netto budget trend" comparison cards.
export async function getMonthComparison(financialMonth: { defaultStartDay: number }) {
  const lastRange = financialMonthRange(financialMonth, -1);
  const priorRange = financialMonthRange(financialMonth, -2);
  const rows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    categoryId: transactions.categoryId,
    categoryName: categories.name,
    categoryColor: categories.color,
    categoryIcon: categories.icon,
    categoryGroup: categories.group,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
  })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, priorRange.from), lte(transactions.date, lastRange.to)));
  const splitRows = await getTransactionSplitRows(rows.map((row) => row.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(rows, splitMap);
  const totals = { last: { income: 0, expense: 0 }, prior: { income: 0, expense: 0 } };
  for (const row of allocations) {
    if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    const bucket = row.date >= lastRange.from ? totals.last : totals.prior;
    if (row.direction === "income" || row.direction === "expense") bucket[row.direction] += row.amount;
  }
  const expenseLast = totals.last.expense;
  const expensePrior = totals.prior.expense;
  const netLast = totals.last.income - totals.last.expense;
  const netPrior = totals.prior.income - totals.prior.expense;
  return { expenseLast, expensePrior, netLast, netPrior, lastRange, priorRange };
}

export function pctChange(now: number, prev: number): number | null {
  if (prev === 0) return null;
  if (now !== 0 && Math.sign(now) !== Math.sign(prev)) return null;
  return ((now - prev) / Math.abs(prev)) * 100;
}

/** One financial month's totals, for the Health tab's month-on-month card. */
export interface MonthTotalsWithCategories {
  month: string; // YYYY-MM (financial month)
  income: number;
  expense: number;
  /** null when there was no income to save from. */
  savingsRate: number | null;
}

/**
 * The financial month in progress against the one before it — income, expenses and
 * savings rate (the same rules as getMonthComparison: reimbursements, internal transfers
 * and savings categories left out), plus the expense category that moved the most.
 */
export async function getCurrentVsPreviousMonth(financialMonth: FinancialMonthConfig) {
  const nowMonth = currentFinancialMonth(financialMonth);
  const prevMonth = offsetFinancialMonth(nowMonth, -1);
  const nowRange = financialMonthRangeByMonth(nowMonth, financialMonth);
  const prevRange = financialMonthRangeByMonth(prevMonth, financialMonth);
  const rows = await db.select({
    id: transactions.id,
    date: transactions.date,
    direction: transactions.direction,
    amount: transactions.amount,
    correctedAmount: transactions.correctedAmount,
    categoryId: transactions.categoryId,
    categoryName: categories.name,
    categoryColor: categories.color,
    categoryIcon: categories.icon,
    categoryGroup: categories.group,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
  })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, prevRange.from), lte(transactions.date, nowRange.to)));
  const splitRows = await getTransactionSplitRows(rows.map((row) => row.id));
  const allocations = buildSplitAllocations(rows, groupTransactionSplits(splitRows));

  const totals = { now: { income: 0, expense: 0 }, prev: { income: 0, expense: 0 } };
  const byCategory = new Map<number, { name: string; now: number; prev: number }>();
  for (const row of allocations) {
    if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    const key = row.date >= nowRange.from ? "now" : "prev";
    if (row.direction === "income" || row.direction === "expense") totals[key][row.direction] += row.amount;
    if (row.direction === "expense" && row.categoryId != null) {
      const entry = byCategory.get(row.categoryId) ?? { name: row.categoryName ?? "", now: 0, prev: 0 };
      entry[key] += row.amount;
      byCategory.set(row.categoryId, entry);
    }
  }
  const rate = (t: { income: number; expense: number }) => (t.income > 0 ? (t.income - t.expense) / t.income : null);
  const biggest = [...byCategory.values()].sort((a, b) => Math.abs(b.now - b.prev) - Math.abs(a.now - a.prev))[0] ?? null;

  return {
    current: { month: nowMonth, ...totals.now, savingsRate: rate(totals.now) } satisfies MonthTotalsWithCategories,
    previous: { month: prevMonth, ...totals.prev, savingsRate: rate(totals.prev) } satisfies MonthTotalsWithCategories,
    biggest: biggest && Math.abs(biggest.now - biggest.prev) > 0.005 ? biggest : null,
  };
}
