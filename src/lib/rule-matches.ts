import { and, desc, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { banks, transactionSplits, transactions } from "@/db/schema";
import type { Bank, CategoryRule } from "@/db/schema";
import { matchRules } from "@/lib/apply-rules";
import { transactionIdRef } from "@/lib/reimbursed-amount";

/** Escapes LIKE's wildcards so a "%" or "_" in a pattern matches itself. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Every transaction `rule` matches now, newest first — run through matchRules, the same
 * function the apply-rules pass uses. Split transactions are left out, as that pass
 * leaves them out. Shared by the rule dialog's preview and a rule's delete.
 */
export async function findRuleMatches(rule: CategoryRule) {
  // Narrow in SQL first (a whole-word match is always a "contains" match too), then let
  // matchRules decide — it's the source of truth for whole words, amounts and banks.
  const pattern = (rule.namePattern ?? "").trim();
  const exact = !rule.nameWildcard && !rule.nameWholeWord;
  const nameFilter = !pattern
    ? undefined
    : exact
      ? sql`lower(trim(${transactions.description})) = ${pattern.toLowerCase()}`
      : sql`${transactions.description} LIKE ${`%${escapeLike(pattern)}%`} ESCAPE '\\'`;

  const [rows, allBanks] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
        direction: transactions.direction,
        account: transactions.account,
        categoryId: transactions.categoryId,
        manuallyCategorized: transactions.manuallyCategorized,
      })
      .from(transactions)
      .where(
        and(
          nameFilter,
          // transactionIdRef, not ${transactions.id}: in a single-table select Drizzle
          // renders a bare "id", which inside this subquery means transaction_splits.id.
          notExists(db.select({ one: sql`1` }).from(transactionSplits).where(sql`${transactionSplits.transactionId} = ${transactionIdRef}`)),
        ),
      )
      .orderBy(desc(transactions.date), desc(transactions.id)),
    db.select().from(banks),
  ]);

  const banksByAccountNumber = new Map<string, Bank>();
  for (const bank of allBanks) if (bank.accountNumber) banksByAccountNumber.set(bank.accountNumber, bank);

  return rows.filter((r) => matchRules(r.description, r.amount, r.direction, r.account, [rule], banksByAccountNumber) != null);
}

/**
 * The matches a rule filed itself, as far as can be told: they carry the rule's category
 * and nobody set it by hand. Deleting the rule may send these back to Needs review.
 */
export const filedByRule = <M extends { categoryId: number | null; manuallyCategorized: boolean }>(matches: M[], categoryId: number) =>
  matches.filter((m) => m.categoryId === categoryId && !m.manuallyCategorized);
