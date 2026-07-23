import { db } from "@/db";
import { categories, categoryRules, transactions, transactionSplits, banks } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { CategoryRule, Bank } from "@/db/schema";
import { loadRecurringMatchers, matchRecurringItem } from "@/lib/recurring-match";

/** Returns the categoryId of the first matching rule, or null. */
export function matchRules(
  description: string,
  amount: number,
  direction: string,
  account: string | null,
  rules: CategoryRule[],
  banksByAccountNumber: Map<string, Bank>,
): number | null {
  const desc = description.trim().toLowerCase();
  for (const rule of rules) {
    const directionOk = rule.direction ? rule.direction === direction : true;

    const nameOk = rule.namePattern
      ? (() => {
          const pat = rule.namePattern.trim().toLowerCase();
          if (rule.nameWholeWord) {
            // Escape regex special chars then wrap in word boundaries
            const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(desc);
          }
          if (rule.nameWildcard) return desc.includes(pat);
          return desc === pat;
        })()
      : true;

    const amountOk = (() => {
      // Range match takes precedence when either bound is set; magnitude comparison so
      // the sign of income/expense amounts doesn't matter.
      if (rule.amountMin != null || rule.amountMax != null) {
        const mag = Math.abs(amount);
        if (rule.amountMin != null && mag < rule.amountMin - 0.01) return false;
        if (rule.amountMax != null && mag > rule.amountMax + 0.01) return false;
        return true;
      }
      if (rule.amount != null) return Math.abs(amount - rule.amount) < 0.01;
      return true;
    })();

    // Bank filter: if the rule has a bankId, look up which account number that bank has
    // and compare against the transaction's account field.
    const bankOk = (() => {
      if (!rule.bankId) return true; // no bank filter = matches all
      // Find the bank with this id
      for (const [accNum, bank] of banksByAccountNumber) {
        if (bank.id === rule.bankId) {
          return account === accNum;
        }
      }
      return false; // bankId set but bank not found → no match
    })();

    if (directionOk && nameOk && amountOk && bankOk) return rule.categoryId;
  }
  return null;
}

/**
 * Apply all rules to transactions that are not manually categorized.
 * Returns the number of transactions updated.
 */
export async function applyAllRules(): Promise<number> {
  const [allRules, allBanks, allCategories, recurringMatchers] = await Promise.all([
    db.select().from(categoryRules),
    db.select().from(banks),
    db.select({ id: categories.id }).from(categories),
    loadRecurringMatchers(),
  ]);
  // Skip rules pointing at categories that no longer exist (left behind by deletes
  // done while foreign keys were off) — assigning their id would violate the FK.
  const categoryIds = new Set(allCategories.map((c) => c.id));
  const rules = allRules.filter((r) => categoryIds.has(r.categoryId));
  // Recurring items may point at a stale category too — drop that assignment, but the
  // recurringItemId link itself is still valid and worth setting.
  const recurring = recurringMatchers.map((r) =>
    r.categoryId != null && !categoryIds.has(r.categoryId) ? { ...r, categoryId: null } : r,
  );

  const banksByAccountNumber = new Map<string, Bank>();
  for (const bank of allBanks) {
    if (bank.accountNumber) banksByAccountNumber.set(bank.accountNumber, bank);
  }

  // All transactions: the recurringItemId link is maintained for every transaction
  // (even manually categorized ones, so the friendly-name override still applies),
  // while the auto-assigned category only ever touches non-manual transactions.
  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      direction: transactions.direction,
      account: transactions.account,
      manuallyCategorized: transactions.manuallyCategorized,
      recurringItemId: transactions.recurringItemId,
    })
    .from(transactions);
  const splitRows = await db.select({ transactionId: transactionSplits.transactionId }).from(transactionSplits);
  const splitTransactionIds = new Set(splitRows.map((row) => row.transactionId));

  let updated = 0;
  for (const row of rows) {
    if (splitTransactionIds.has(row.id)) continue;

    const recurringMatch = matchRecurringItem(row.description, row.amount, recurring);
    const newRecurringItemId = recurringMatch?.id ?? null;

    const patch: { categoryId?: number | null; recurringItemId?: number | null } = {};
    if (newRecurringItemId !== row.recurringItemId) patch.recurringItemId = newRecurringItemId;

    if (recurringMatch?.categoryId != null) {
      // A recurring item's category overrules everything — including a manually assigned
      // category — for the transactions it matches (its icon does the same at display time).
      if (recurringMatch.categoryId !== row.categoryId) patch.categoryId = recurringMatch.categoryId;
    } else if (!row.manuallyCategorized) {
      // No recurring category → fall back to generic category rules for auto-categorised rows.
      const ruleCategoryId = rules.length
        ? matchRules(row.description, row.amount, row.direction, row.account, rules, banksByAccountNumber)
        : null;
      if (ruleCategoryId !== row.categoryId) patch.categoryId = ruleCategoryId;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(transactions).set(patch).where(eq(transactions.id, row.id));
      updated++;
    }
  }
  return updated;
}
