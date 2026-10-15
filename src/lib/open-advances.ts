import { db } from "@/db";
import { categories, merchants, transactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { transactionIdRef } from "@/lib/reimbursed-amount";

export interface OpenAdvance {
  /** The expense you paid up front. */
  transactionId: number;
  date: string;
  name: string;
  icon: string | null;
  color: string | null;
  /** What you expect back in total (expectedReimbursement, or the full amount). */
  expected: number;
  /** What has come back so far through linked reimbursements (Tikkies). */
  received: number;
  remaining: number;
}

/**
 * Advances still open: expenses with at least one reimbursement linked to them where the
 * linked total is still short of what you expect back — the same rule as the old
 * "Openstaande voorschotten" list. An expense nobody has paid anything back on yet has no
 * link and no expected amount, so it isn't known to be an advance and isn't listed.
 */
export async function getOpenAdvances(): Promise<OpenAdvance[]> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      merchantName: merchants.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      expectedReimbursement: transactions.expectedReimbursement,
      linkedAmount: sql<number>`COALESCE((
        SELECT sum(r2.amount) FROM reimbursements r2
        WHERE r2.original_transaction_id = ${transactionIdRef}
      ), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(sql`EXISTS (SELECT 1 FROM reimbursements r WHERE r.original_transaction_id = ${transactionIdRef})`)
    .orderBy(sql`${transactions.date} desc`);

  return rows
    .map((r) => {
      const expected = r.expectedReimbursement ?? r.amount;
      return {
        transactionId: r.id,
        date: r.date,
        name: r.merchantName ?? r.description,
        icon: r.categoryIcon,
        color: r.categoryColor,
        expected,
        received: r.linkedAmount,
        remaining: Math.round((expected - r.linkedAmount) * 100) / 100,
      };
    })
    .filter((a) => a.remaining > 0.01);
}
