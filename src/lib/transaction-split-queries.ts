import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactionSplits } from "@/db/schema";

export async function getTransactionSplitRows(transactionIds: number[]) {
  if (transactionIds.length === 0) return [];

  return db
    .select({
      id: transactionSplits.id,
      transactionId: transactionSplits.transactionId,
      amount: transactionSplits.amount,
      categoryId: transactionSplits.categoryId,
      position: transactionSplits.position,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryGroup: categories.group,
    })
    .from(transactionSplits)
    .leftJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .where(inArray(transactionSplits.transactionId, transactionIds))
    .orderBy(asc(transactionSplits.transactionId), asc(transactionSplits.position));
}
