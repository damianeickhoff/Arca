import { db } from "@/db";
import { transactions, categories, banks, merchants, recurringItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { getDisplayedTransactionCategory, groupTransactionSplits } from "@/lib/transaction-splits";

/**
 * One transaction in the exact shape the detail sheet expects (TransactionDetail) —
 * the same joins and split handling the transactions page does for a whole list, for
 * a single row.
 *
 * This exists for the surfaces that list transactions but don't carry the full row:
 * the merchant and category profiles hold only enough for their own list (id, date,
 * amount, name), so opening the sheet from there means fetching the rest by id.
 */
export async function getTransactionDetailById(id: number) {
  const [row] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      type: transactions.type,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryGroup: categories.group,
      categoryBudgetType: categories.budgetType,
      brandIcon: transactions.brandIcon,
      brandIconColor: transactions.brandIconColor,
      brandIconBgColor: transactions.brandIconBgColor,
      source: transactions.source,
      bankName: banks.displayName,
      notes: transactions.notes,
      customName: transactions.customName,
      receiptUrl: transactions.receiptUrl,
      excludeFromReports: transactions.excludeFromReports,
      budgetTypeOverride: transactions.budgetTypeOverride,
      isReimbursement: transactions.isReimbursement,
      isManualTransfer: transactions.isManualTransfer,
      isInternalTransfer: isInternalTransferExpr,
      transferType: effectiveTransferTypeExpr,
      goalId: transactions.goalId,
      recurringItemId: transactions.recurringItemId,
      recurringName: recurringItems.name,
      recurringFriendlyName: recurringItems.friendlyName,
      merchantIcon: merchants.icon,
      merchantColor: merchants.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(banks, eq(transactions.account, banks.accountNumber))
    .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(eq(transactions.id, id));

  if (!row) return null;

  // Split rows carry their own categories, so the parent's category is deliberately
  // blanked out and replaced by the split summary — same rule as the list.
  const splits = groupTransactionSplits(await getTransactionSplitRows([row.id])).get(row.id) ?? [];
  return { ...row, ...getDisplayedTransactionCategory(row, splits), splits };
}
