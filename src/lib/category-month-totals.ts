import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { budgetTargets, categories, transactions } from "@/db/schema";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { financialMonthRange } from "@/lib/date-range";

/**
 * What each category counted this financial month, for the Categories settings list:
 * money spent for spending categories, money received for income ones and money put
 * aside for savings ones (split transactions count per part). Reimbursements and
 * transfers between your own accounts are left out, except into savings. Also the
 * standing budget of every category and group that has one.
 */
export async function getCategoryMonthTotals() {
  const { from, to } = financialMonthRange(await getFinancialMonthConfig());
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      categoryId: transactions.categoryId,
      categoryGroup: categories.group,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));
  const allocations = buildSplitAllocations(rows, groupTransactionSplits(await getTransactionSplitRows(rows.map((r) => r.id))));

  const totals: Record<number, number> = {};
  for (const a of allocations) {
    if (a.categoryId == null || a.isReimbursement) continue;
    const kind = a.categoryGroup ?? "";
    if (kind !== "savings" && a.isInternalTransfer) continue;
    const counts = kind === "income" ? a.direction === "income" : a.direction === "expense";
    if (counts) totals[a.categoryId] = (totals[a.categoryId] ?? 0) + a.amount;
  }

  const budgets: Record<number, number> = {};
  for (const t of await db.select().from(budgetTargets).where(and(eq(budgetTargets.year, 0), eq(budgetTargets.month, 0)))) {
    if (t.categoryId != null && t.targetAmount > 0) budgets[t.categoryId] = t.targetAmount;
  }
  return { totals, budgets };
}
