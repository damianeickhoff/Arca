import { and, gte } from "drizzle-orm";
import { db } from "@/db";
import { banks, categories, categoryRules, transactions, transactionSplits } from "@/db/schema";
import type { Bank, CategoryRule } from "@/db/schema";
import { loadMerchantDefaults, matchRules } from "@/lib/apply-rules";
import { loadRecurringMatchers, matchRecurringItem } from "@/lib/recurring-match";
import { notInternalTransferCondition } from "@/lib/internal-transfers";

// What category rules do to the transactions already there, worked out on demand:
// the category editor's per-rule counts and conflicts (one pass per opened category)
// and the rule dialog's Test (one rule, the last 90 days).

/** Conflicts and Test look at this many recent days. */
export const RECENT_DAYS = 90;

export interface RuleConflict {
  /** The other rule, which files the same transaction elsewhere. */
  id: number;
  pattern: string | null;
  categoryId: number;
  /** This rule comes first, so it is the one that decides. */
  wins: boolean;
}

export interface RuleStat {
  ruleId: number;
  /** Transactions whose category this rule decides (it is the first that matches). */
  decides: number;
  /** Rules of other categories that match the same recent transactions. */
  conflicts: RuleConflict[];
}

export interface RuleTestChange {
  id: number;
  date: string;
  description: string;
  from: string | null;
  to: string | null;
}

export interface RuleTestResult {
  days: number;
  /** Every change; `changes` lists the latest of them. */
  total: number;
  changes: RuleTestChange[];
}

const TEST_LIST = 30;

function recentSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - RECENT_DAYS);
  return d.toISOString().slice(0, 10);
}

const matches = (row: { description: string; amount: number; direction: string; account: string | null }, rule: CategoryRule, banksByAccountNumber: Map<string, Bank>) =>
  matchRules(row.description, row.amount, row.direction, row.account, [rule], banksByAccountNumber) != null;

/** The rules the apply-rules pass uses (in its order), the accounts, category names and split ids. */
async function loadContext() {
  const [allRules, allBanks, allCategories, splitRows] = await Promise.all([
    db.select().from(categoryRules),
    db.select().from(banks),
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select({ id: transactionSplits.transactionId }).from(transactionSplits),
  ]);
  const categoryNames = new Map(allCategories.map((c) => [c.id, c.name]));
  const banksByAccountNumber = new Map<string, Bank>();
  for (const bank of allBanks) if (bank.accountNumber) banksByAccountNumber.set(bank.accountNumber, bank);
  return {
    rules: allRules.filter((r) => categoryNames.has(r.categoryId)),
    banksByAccountNumber,
    categoryNames,
    splitIds: new Set(splitRows.map((s) => s.id)),
  };
}

/**
 * For each rule of one category: how many transactions it decides, and which rules of
 * other categories match the same transactions of the last 90 days. One pass over the
 * transactions; every rule is only tried on a transaction this category's rules match.
 */
export async function getCategoryRuleStats(categoryId: number): Promise<RuleStat[]> {
  const { rules, banksByAccountNumber, splitIds } = await loadContext();
  const own = rules.filter((r) => r.categoryId === categoryId);
  if (own.length === 0) return [];
  const order = new Map(rules.map((r, i) => [r.id, i]));
  const since = recentSince();

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      direction: transactions.direction,
      account: transactions.account,
    })
    .from(transactions)
    .where(notInternalTransferCondition);

  const decides = new Map<number, number>();
  const conflicts = new Map<number, Map<number, RuleConflict>>();
  for (const row of rows) {
    if (splitIds.has(row.id)) continue;
    const ownMatches = own.filter((r) => matches(row, r, banksByAccountNumber));
    if (ownMatches.length === 0) continue;
    const all = rules.filter((r) => matches(row, r, banksByAccountNumber));
    const first = all[0];
    if (first && first.categoryId === categoryId) decides.set(first.id, (decides.get(first.id) ?? 0) + 1);
    if (row.date < since) continue;
    for (const r of ownMatches) {
      for (const other of all) {
        if (other.categoryId === categoryId) continue;
        const set = conflicts.get(r.id) ?? new Map<number, RuleConflict>();
        set.set(other.id, { id: other.id, pattern: other.namePattern, categoryId: other.categoryId, wins: order.get(r.id)! < order.get(other.id)! });
        conflicts.set(r.id, set);
      }
    }
  }

  return own.map((r) => ({ ruleId: r.id, decides: decides.get(r.id) ?? 0, conflicts: [...(conflicts.get(r.id)?.values() ?? [])] }));
}

/**
 * What saving `draft` (replacing the rule `ruleId`, or as a new rule after the others)
 * would change on the last 90 days: the transactions whose category the rules pass
 * would set differently because of this rule. Writes nothing; saving applies it.
 */
export async function testRule(draft: CategoryRule, ruleId: number | null): Promise<RuleTestResult> {
  const { rules: saved, banksByAccountNumber, categoryNames, splitIds } = await loadContext();
  const [recurring, merchantDefaults] = await Promise.all([loadRecurringMatchers(), loadMerchantDefaults(new Set(categoryNames.keys()))]);
  const DRAFT = -1;
  const candidate = { ...draft, id: DRAFT };
  const before = saved;
  const after = ruleId != null && saved.some((r) => r.id === ruleId) ? saved.map((r) => (r.id === ruleId ? candidate : r)) : [...saved, candidate];

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      direction: transactions.direction,
      account: transactions.account,
      categoryId: transactions.categoryId,
      merchantId: transactions.merchantId,
      manuallyCategorized: transactions.manuallyCategorized,
    })
    .from(transactions)
    .where(and(gte(transactions.date, recentSince()), notInternalTransferCondition));

  const changes: RuleTestChange[] = [];
  for (const row of rows) {
    // The rows the pass leaves to something else: splits, hand-filed ones and the ones a
    // recurring item's category decides.
    if (splitIds.has(row.id) || row.manuallyCategorized) continue;
    if (matchRecurringItem(row.description, row.amount, recurring)?.categoryId != null) continue;
    const firstAfter = after.find((r) => matches(row, r, banksByAccountNumber));
    const firstBefore = before.find((r) => matches(row, r, banksByAccountNumber));
    // Only what this rule is behind: it decides now, or it decided before the edit.
    if (firstAfter?.id !== DRAFT && (ruleId == null || firstBefore?.id !== ruleId)) continue;
    const to = firstAfter?.categoryId ?? (row.merchantId != null ? merchantDefaults.get(row.merchantId) ?? null : null);
    // The pass never clears a category when nothing matches any more.
    if (to == null || to === row.categoryId) continue;
    changes.push({
      id: row.id,
      date: row.date,
      description: row.description,
      from: row.categoryId != null ? categoryNames.get(row.categoryId) ?? null : null,
      to: categoryNames.get(to) ?? null,
    });
  }
  changes.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return { days: RECENT_DAYS, total: changes.length, changes: changes.slice(0, TEST_LIST) };
}
