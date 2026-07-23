import { db } from "@/db";
import { transactions } from "@/db/schema";
import { and, gte, lte } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { currentFinancialMonth, financialMonthRangeByMonth, type FinancialMonthConfig } from "@/lib/date-range";

// Total income for the current financial month — a fresh, split-aware aggregation
// over `transactions` (not derived from any page's cached budget data).
export async function getCurrentMonthIncome(financialMonth: FinancialMonthConfig): Promise<number> {
  const { from, to } = financialMonthRangeByMonth(currentFinancialMonth(financialMonth), financialMonth);

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  const splitRows = await getTransactionSplitRows(rows.map((r) => r.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(rows, splitMap);

  return allocations
    .filter((row) => row.direction === "income" && !row.isReimbursement && !row.isInternalTransfer)
    .reduce((sum, row) => sum + row.amount, 0);
}
