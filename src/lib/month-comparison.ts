import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { financialMonthRange } from "@/lib/date-range";

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
