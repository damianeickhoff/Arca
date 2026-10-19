import { db } from "@/db";
import { categories, categoryRules, merchants, transactions, transactionSplits, banks } from "@/db/schema";
import { eq, gte } from "drizzle-orm";
import type { CategoryRule, Bank } from "@/db/schema";
import { loadRecurringMatchers, matchRecurringItem } from "@/lib/recurring-match";

/** |amount| in whole cents. */
function cents(amount: number): number {
  return Math.round(Math.abs(amount) * 100);
}

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
      // Magnitudes in whole cents throughout — the same rule as recurring matching
      // (transactionMatchesRecurringItem): the sign of income/expense doesn't matter, and
      // "within a cent" is inclusive (a float difference of 0.010000000000001 is one cent).
      // Range match takes precedence when either bound is set.
      const mag = cents(amount);
      if (rule.amountMin != null || rule.amountMax != null) {
        if (rule.amountMin != null && mag < cents(rule.amountMin) - 1) return false;
        if (rule.amountMax != null && mag > cents(rule.amountMax) + 1) return false;
        return true;
      }
      if (rule.amount != null) return Math.abs(mag - cents(rule.amount)) <= 1;
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

/** Merchant id → its default category, for merchants that have a live one. */
export async function loadMerchantDefaults(categoryIds: Set<number>): Promise<Map<number, number>> {
  const rows = await db
    .select({ id: merchants.id, defaultCategoryId: merchants.defaultCategoryId })
    .from(merchants)
    .where(eq(merchants.deleted, false));
  const map = new Map<number, number>();
  for (const r of rows) if (r.defaultCategoryId != null && categoryIds.has(r.defaultCategoryId)) map.set(r.id, r.defaultCategoryId);
  return map;
}

/**
 * The category the rules give a transaction: the first matching category rule, else
 * its merchant's default category (a rule with only a name condition, checked last).
 */
export function categoryFor(
  row: { description: string; amount: number; direction: string; account: string | null; merchantId: number | null },
  rules: CategoryRule[],
  banksByAccountNumber: Map<string, Bank>,
  merchantDefaults: Map<number, number>,
): number | null {
  const ruled = rules.length ? matchRules(row.description, row.amount, row.direction, row.account, rules, banksByAccountNumber) : null;
  if (ruled != null) return ruled;
  return row.merchantId != null ? merchantDefaults.get(row.merchantId) ?? null : null;
}

/** What the rule pass would change on one transaction. */
export interface RulePassChange {
  id: number;
  date: string;
  description: string;
  fromCategoryId: number | null;
  patch: { categoryId?: number | null; recurringItemId?: number | null; isReimbursement?: boolean };
  /** The values the patched fields had — what the change log's undo puts back. */
  before: { categoryId: number | null; recurringItemId: number | null; isReimbursement: boolean };
}

/**
 * Works out what applying every rule would change, without writing anything — the
 * pass applyAllRules runs, and Settings › Automations' "Test" (with `since`, a
 * YYYY-MM-DD lower bound on the transaction date).
 */
export async function planRulePass(opts: { since?: string } = {}): Promise<RulePassChange[]> {
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
  const merchantDefaults = await loadMerchantDefaults(categoryIds);

  // All transactions: the recurringItemId link is maintained for every transaction
  // (even manually categorized ones, so the friendly-name override still applies),
  // while the auto-assigned category only ever touches non-manual transactions.
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      direction: transactions.direction,
      account: transactions.account,
      merchantId: transactions.merchantId,
      manuallyCategorized: transactions.manuallyCategorized,
      recurringItemId: transactions.recurringItemId,
      isReimbursement: transactions.isReimbursement,
    })
    .from(transactions)
    .where(opts.since ? gte(transactions.date, opts.since) : undefined);
  const splitRows = await db.select({ transactionId: transactionSplits.transactionId }).from(transactionSplits);
  const splitTransactionIds = new Set(splitRows.map((row) => row.transactionId));

  const changes: RulePassChange[] = [];
  for (const row of rows) {
    if (splitTransactionIds.has(row.id)) continue;

    const recurringMatch = matchRecurringItem(row.description, row.amount, recurring);
    const newRecurringItemId = recurringMatch?.id ?? null;

    const patch: RulePassChange["patch"] = {};
    if (newRecurringItemId !== row.recurringItemId) patch.recurringItemId = newRecurringItemId;

    // Flagging the standing payback of a shared bill, so it stops counting as income.
    // Only ever set — never unset: this runs over the whole table on every rule or
    // recurring edit, and clearing it would wipe the manual "Mark as reimbursement"
    // toggle off every Tikkie. Un-flagging stays a per-transaction action.
    if (recurringMatch?.isReimbursement && row.direction === "income" && !row.isReimbursement) {
      patch.isReimbursement = true;
    }

    if (recurringMatch?.categoryId != null) {
      // A recurring item's category overrules everything — including a manually assigned
      // category — for the transactions it matches (its icon does the same at display time).
      if (recurringMatch.categoryId !== row.categoryId) patch.categoryId = recurringMatch.categoryId;
    } else if (!row.manuallyCategorized) {
      // No recurring category → a matching category rule wins for auto-categorised rows.
      // Only a match overrides: when no rule matches, the category the row already has
      // stays. Clearing it to null here used to wipe every category the importer had
      // learned from history, matched by keyword or set by the Tikkie rule — this pass
      // runs at the end of every import and after every rule or recurring edit.
      // The merchant's default category counts as the last rule.
      const ruleCategoryId = categoryFor(row, rules, banksByAccountNumber, merchantDefaults);
      if (ruleCategoryId !== null && ruleCategoryId !== row.categoryId) patch.categoryId = ruleCategoryId;
    }

    if (Object.keys(patch).length > 0) {
      changes.push({
        id: row.id,
        date: row.date,
        description: row.description,
        fromCategoryId: row.categoryId,
        patch,
        before: { categoryId: row.categoryId, recurringItemId: row.recurringItemId, isReimbursement: row.isReimbursement },
      });
    }
  }
  return changes;
}

/** Writes the changes planRulePass worked out. Returns how many transactions changed. */
export async function applyRulePass(changes: RulePassChange[]): Promise<number> {
  for (const c of changes) await db.update(transactions).set(c.patch).where(eq(transactions.id, c.id));
  return changes.length;
}

/**
 * Apply all rules to transactions that are not manually categorized.
 * Returns the number of transactions updated.
 */
export async function applyAllRules(): Promise<number> {
  return applyRulePass(await planRulePass());
}
