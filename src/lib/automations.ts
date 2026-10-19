import { and, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { banks, categories, categoryRules, transactions, transactionSplits } from "@/db/schema";
import type { Bank, CategoryRule } from "@/db/schema";
import { loadMerchantDefaults, matchRules } from "@/lib/apply-rules";
import { listMerchants, type MerchantListItem } from "@/lib/merchants";
import { notInternalTransferCondition } from "@/lib/internal-transfers";

// Settings › Automations: every merchant and category rule in one list, with how many
// transactions each decides today, rules that fight over the same recent transaction,
// and busy merchants nobody taught yet.

/** A rule fights another one when both match one of these recent transactions. */
export const CONFLICT_WINDOW_DAYS = 90;
/** A merchant with at least this many transactions without a category and no rule gets a suggestion. */
export const SUGGEST_MIN_UNFILED = 5;

export interface AutomationRule {
  rule: CategoryRule;
  /** Transactions whose category this rule decides (it is the first that matches). */
  decides: number;
  /** Other rules (different category) that match the same recent transactions. */
  conflictsWith: number[];
  /** The merchant most of its transactions belong to, when there is one. */
  merchantId: number | null;
}

export interface AutomationMerchant {
  merchant: MerchantListItem;
  /** Transactions filed by the merchant's own category (no rule matched them). */
  decides: number;
}

export interface MerchantSuggestion {
  merchant: MerchantListItem;
  unfiled: number;
  /** A transaction of it without a category, for the teach strip. */
  sampleTransactionId: number;
}

export interface AutomationsOverview {
  rules: AutomationRule[];
  merchants: AutomationMerchant[];
  suggestions: MerchantSuggestion[];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function getAutomationsOverview(): Promise<AutomationsOverview> {
  const [allRules, allBanks, allCategories, merchants, rows, splitRows] = await Promise.all([
    db.select().from(categoryRules),
    db.select().from(banks),
    db.select({ id: categories.id }).from(categories),
    listMerchants(),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
        direction: transactions.direction,
        account: transactions.account,
        categoryId: transactions.categoryId,
        merchantId: transactions.merchantId,
        recurringItemId: transactions.recurringItemId,
      })
      .from(transactions)
      .where(notInternalTransferCondition),
    db.select({ id: transactionSplits.transactionId }).from(transactionSplits),
  ]);

  const categoryIds = new Set(allCategories.map((c) => c.id));
  const rules = allRules.filter((r) => categoryIds.has(r.categoryId));
  const banksByAccountNumber = new Map<string, Bank>();
  for (const bank of allBanks) if (bank.accountNumber) banksByAccountNumber.set(bank.accountNumber, bank);
  const merchantDefaults = await loadMerchantDefaults(categoryIds);
  const splitIds = new Set(splitRows.map((s) => s.id));
  const since = daysAgo(CONFLICT_WINDOW_DAYS);

  const decides = new Map<number, number>();
  const merchantVotes = new Map<number, Map<number, number>>();
  const conflicts = new Map<number, Set<number>>();
  const merchantDecides = new Map<number, number>();

  for (const row of rows) {
    if (splitIds.has(row.id)) continue;
    const matching = rules.filter((r) => matchRules(row.description, row.amount, row.direction, row.account, [r], banksByAccountNumber) != null);
    const first = matching[0];
    if (first) {
      decides.set(first.id, (decides.get(first.id) ?? 0) + 1);
      if (row.merchantId != null) {
        const votes = merchantVotes.get(first.id) ?? new Map<number, number>();
        votes.set(row.merchantId, (votes.get(row.merchantId) ?? 0) + 1);
        merchantVotes.set(first.id, votes);
      }
      // Two rules that disagree about a recent transaction.
      if (row.date >= since) {
        for (const a of matching) {
          for (const b of matching) {
            if (a.id === b.id || a.categoryId === b.categoryId) continue;
            const set = conflicts.get(a.id) ?? new Set<number>();
            set.add(b.id);
            conflicts.set(a.id, set);
          }
        }
      }
    } else if (row.merchantId != null && row.recurringItemId == null && merchantDefaults.has(row.merchantId)) {
      merchantDecides.set(row.merchantId, (merchantDecides.get(row.merchantId) ?? 0) + 1);
    }
  }

  const ruleRows: AutomationRule[] = rules.map((rule) => {
    const votes = merchantVotes.get(rule.id);
    const top = votes ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0] : undefined;
    return {
      rule,
      decides: decides.get(rule.id) ?? 0,
      conflictsWith: [...(conflicts.get(rule.id) ?? [])],
      merchantId: top ? top[0] : null,
    };
  });

  const ruledMerchants = new Set(ruleRows.map((r) => r.merchantId).filter((id): id is number => id != null));
  const merchantRows: AutomationMerchant[] = merchants
    .filter((m) => m.patterns.length > 0 || m.defaultCategoryId != null || ruledMerchants.has(m.id))
    .map((m) => ({ merchant: m, decides: merchantDecides.get(m.id) ?? 0 }));

  // Busy merchants without a rule: count their transactions that still have no category.
  const unfiled = await db
    .select({ merchantId: transactions.merchantId, count: sql<number>`count(*)`, sample: sql<number>`max(${transactions.id})` })
    .from(transactions)
    .where(and(isNull(transactions.categoryId), notInternalTransferCondition))
    .groupBy(transactions.merchantId);
  const byId = new Map(merchants.map((m) => [m.id, m]));
  const suggestions: MerchantSuggestion[] = unfiled
    .filter((u) => u.merchantId != null && Number(u.count) >= SUGGEST_MIN_UNFILED)
    .map((u) => ({ merchant: byId.get(u.merchantId!), unfiled: Number(u.count), sampleTransactionId: Number(u.sample) }))
    .filter((s): s is MerchantSuggestion => !!s.merchant && s.merchant.defaultCategoryId == null && !ruledMerchants.has(s.merchant.id))
    .sort((a, b) => b.unfiled - a.unfiled);

  return { rules: ruleRows, merchants: merchantRows, suggestions };
}
