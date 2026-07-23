import { db } from "@/db";
import { transactions, transactionSplits } from "@/db/schema";
import { sql, isNotNull, notInArray } from "drizzle-orm";

/** Number of transactions linked to each category — counts a transaction's own
 * categoryId unless it has splits, in which case each split's categoryId counts
 * instead (mirrors the allocation logic in lib/transaction-splits.ts). */
export async function getCategoryTransactionCounts(): Promise<Record<number, number>> {
  const splitTxIds = db.select({ id: transactionSplits.transactionId }).from(transactionSplits);

  const [direct, splits] = await Promise.all([
    db
      .select({ categoryId: transactions.categoryId, count: sql<number>`count(*)` })
      .from(transactions)
      .where(sql`${isNotNull(transactions.categoryId)} and ${notInArray(transactions.id, splitTxIds)}`)
      .groupBy(transactions.categoryId),
    db
      .select({ categoryId: transactionSplits.categoryId, count: sql<number>`count(*)` })
      .from(transactionSplits)
      .where(isNotNull(transactionSplits.categoryId))
      .groupBy(transactionSplits.categoryId),
  ]);

  const counts: Record<number, number> = {};
  for (const row of direct) {
    if (row.categoryId != null) counts[row.categoryId] = (counts[row.categoryId] ?? 0) + Number(row.count);
  }
  for (const row of splits) {
    if (row.categoryId != null) counts[row.categoryId] = (counts[row.categoryId] ?? 0) + Number(row.count);
  }
  return counts;
}
