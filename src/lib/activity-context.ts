import { db } from "@/db";
import { merchants, recurringItems, transactions } from "@/db/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getBudgetOverview } from "@/lib/budget-overview";
import { financialMonthRange, type FinancialMonthConfig } from "@/lib/date-range";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import type { ActivityContext } from "@/app/transactions/_activity/context";

/**
 * What the transaction detail panel shows around one transaction: every category's
 * budget and spend this financial month, this month's spend per category split by
 * merchant (split-aware), and the recurring items the given transactions are linked
 * to. Activity builds it for the rows on screen; the other places that open the panel
 * fetch it from /api/activity-context for the one transaction they open.
 */
export async function getActivityContext(financialMonth: FinancialMonthConfig, recurringIds: number[]): Promise<ActivityContext> {
  const monthRange = financialMonthRange(financialMonth, 0);
  const ids = [...new Set(recurringIds)];
  const [budgetOverview, monthRows, recurringRows] = await Promise.all([
    getBudgetOverview(financialMonth),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        categoryId: transactions.categoryId,
        description: transactions.description,
        merchantName: merchants.name,
        isReimbursement: transactions.isReimbursement,
        isInternalTransfer: isInternalTransferExpr,
      })
      .from(transactions)
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(and(gte(transactions.date, monthRange.from), lte(transactions.date, monthRange.to), eq(transactions.direction, "expense"))),
    ids.length > 0 ? db.select().from(recurringItems).where(inArray(recurringItems.id, ids)) : Promise.resolve([]),
  ]);

  // This financial month's expense per category, split by merchant (split-aware).
  const monthSplits = groupTransactionSplits(await getTransactionSplitRows(monthRows.map((r) => r.id)));
  const merchantOf = new Map(monthRows.map((r) => [r.id, r.merchantName ?? r.description]));
  const byCategory = new Map<number, Map<string, number>>();
  for (const a of buildSplitAllocations(monthRows, monthSplits)) {
    if (a.direction !== "expense" || a.isInternalTransfer || a.isReimbursement || a.categoryId == null) continue;
    const name = merchantOf.get(a.transactionId) ?? "";
    const cat = byCategory.get(a.categoryId) ?? new Map<string, number>();
    cat.set(name, (cat.get(name) ?? 0) + a.amount);
    byCategory.set(a.categoryId, cat);
  }
  return {
    budgets: Object.fromEntries(budgetOverview.categories.map((c) => [c.categoryId, { budget: c.budget, spent: c.spent }])),
    merchantSpend: Object.fromEntries(
      [...byCategory].map(([id, m]) => [id, [...m].map(([name, amount]) => ({ name, amount })).sort((a, z) => z.amount - a.amount)]),
    ),
    recurring: Object.fromEntries(recurringRows.map((r) => [r.id, r])),
  };
}
