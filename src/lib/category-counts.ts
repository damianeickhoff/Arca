import { db } from "@/db";
import { categories, transactions, transactionSplits } from "@/db/schema";
import { and, eq, gte, sql, isNotNull, notInArray } from "drizzle-orm";

/** Number of transactions linked to each category — counts a transaction's own
 * categoryId unless it has splits, in which case each split's categoryId counts
 * instead (mirrors the allocation logic in lib/transaction-splits.ts).
 *
 * `since` (YYYY-MM-DD) only counts transactions on or after that date; `skipGroups`
 * leaves out group categories (Housing-style headers that are never assigned).
 * Returned most used first. */
export async function getCategoryTransactionCounts(
  opts: { since?: string; skipGroups?: boolean } = {},
): Promise<{ categoryId: number; count: number }[]> {
  const splitTxIds = db.select({ id: transactionSplits.transactionId }).from(transactionSplits);
  const since = opts.since ? gte(transactions.date, opts.since) : undefined;

  const [direct, splits, groups] = await Promise.all([
    db
      .select({ categoryId: transactions.categoryId, count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(isNotNull(transactions.categoryId), notInArray(transactions.id, splitTxIds), since))
      .groupBy(transactions.categoryId),
    db
      .select({ categoryId: transactionSplits.categoryId, count: sql<number>`count(*)` })
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .where(and(isNotNull(transactionSplits.categoryId), since))
      .groupBy(transactionSplits.categoryId),
    opts.skipGroups ? db.select({ id: categories.id }).from(categories).where(eq(categories.isGroup, true)) : Promise.resolve([]),
  ]);

  const skip = new Set(groups.map((g) => g.id));
  const counts = new Map<number, number>();
  for (const row of [...direct, ...splits]) {
    if (row.categoryId == null || skip.has(row.categoryId)) continue;
    counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + Number(row.count));
  }
  return [...counts].map(([categoryId, count]) => ({ categoryId, count })).sort((a, b) => b.count - a.count || a.categoryId - b.categoryId);
}
