import { db } from "@/db";
import { transactions, categories, banks, recurringItems } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { groupTransactionSplits } from "@/lib/transaction-splits";

// A transaction "needs review" when it has no category. Internal transfers have no
// category by nature (they're never categorized), and split transactions carry their
// categories on the individual splits — so both are excluded from the review queue.
export async function getNeedsReviewTransactions() {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryGroup: categories.group,
      brandIcon: transactions.brandIcon,
      brandIconColor: transactions.brandIconColor,
      brandIconBgColor: transactions.brandIconBgColor,
      bankName: banks.displayName,
      notes: transactions.notes,
      customName: transactions.customName,
      receiptUrl: transactions.receiptUrl,
      excludeFromReports: transactions.excludeFromReports,
      budgetTypeOverride: transactions.budgetTypeOverride,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
      transferType: effectiveTransferTypeExpr,
      goalId: transactions.goalId,
      recurringItemId: transactions.recurringItemId,
      recurringName: recurringItems.name,
      recurringFriendlyName: recurringItems.friendlyName,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(banks, eq(transactions.account, banks.accountNumber))
    .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
    .where(isNull(transactions.categoryId))
    .orderBy(desc(transactions.date), desc(transactions.id));

  // Exclude internal transfers (no category expected) and split transactions
  // (categorized per-split, so the parent's null category isn't a gap).
  const splitMap = groupTransactionSplits(await getTransactionSplitRows(rows.map((r) => r.id)));
  return rows.filter((r) => !r.isInternalTransfer && (splitMap.get(r.id)?.length ?? 0) === 0);
}
