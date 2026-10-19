import { db } from "@/db";
import { banks, categories, categoryRules, merchants, recurringItems, transactions, transactionSplits } from "@/db/schema";
import { eq, inArray, like, or } from "drizzle-orm";
import type { Bank } from "@/db/schema";
import { matchRules } from "@/lib/apply-rules";
import { guessMerchant } from "@/lib/recurring-prefill";
import { resolveDisplayName } from "@/lib/friendly-names";

/**
 * What the category picker needs to set a category on one or more transactions: the
 * categories to suggest first, the names for its subtitle, and — for "Also create a
 * rule" — the name patterns a rule would match and the other transactions those
 * patterns already match (they get the category straight away too).
 */
export interface CategorySuggestions {
  /** Category ids, best first (at most SUGGESTION_LIMIT). */
  suggested: number[];
  /** Display names of the picked transactions, each once. */
  names: string[];
  /** Their amounts added up, signed: spending negative, income positive. */
  total: number;
  /** One name pattern per distinct merchant — what the rule matches on ("contains"). */
  patterns: string[];
  /** The direction every picked transaction shares, or null when they're mixed. */
  direction: "income" | "expense" | null;
  /** Other transactions the patterns match today (split ones left out). */
  similarIds: number[];
  /** The merchant every picked transaction shares, or null (none, or several). */
  merchantName: string | null;
}

export const SUGGESTION_LIMIT = 3;

/** Weight of a category a rule or recurring item would assign — beats any history. */
const RULE_WEIGHT = 10;

/**
 * Sums the votes per category and returns the best ones. Ties keep the order the
 * categories were first voted for, so a rule match (voted first) wins a tie.
 */
export function rankCategorySuggestions(
  votes: { categoryId: number; weight: number }[],
  validIds: Set<number>,
  limit = SUGGESTION_LIMIT,
): number[] {
  const score = new Map<number, number>();
  for (const v of votes) {
    if (!validIds.has(v.categoryId)) continue;
    score.set(v.categoryId, (score.get(v.categoryId) ?? 0) + v.weight);
  }
  return [...score.entries()]
    .map(([id, s], order) => ({ id, s, order }))
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .slice(0, limit)
    .map((e) => e.id);
}

/** The rule pattern for a description: the merchant-like start, too short → none. */
export function rulePatternOf(description: string): string | null {
  const pattern = guessMerchant(description).trim();
  return pattern.length >= 2 ? pattern : null;
}

export async function getCategorySuggestions(ids: number[]): Promise<CategorySuggestions> {
  const empty: CategorySuggestions = { suggested: [], names: [], total: 0, patterns: [], direction: null, similarIds: [], merchantName: null };
  if (ids.length === 0) return empty;

  const picked = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      customName: transactions.customName,
      amount: transactions.amount,
      direction: transactions.direction,
      account: transactions.account,
      merchantId: transactions.merchantId,
      recurringFriendlyName: recurringItems.friendlyName,
      recurringCategoryId: recurringItems.categoryId,
    })
    .from(transactions)
    .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
    .where(inArray(transactions.id, ids));
  if (picked.length === 0) return empty;

  const [rules, allBanks, allCategories] = await Promise.all([
    db.select().from(categoryRules),
    db.select().from(banks),
    db.select({ id: categories.id, isGroup: categories.isGroup }).from(categories),
  ]);
  // Groups are never suggested: only a category goes on a transaction.
  const validIds = new Set(allCategories.filter((c) => !c.isGroup).map((c) => c.id));
  const banksByAccountNumber = new Map<string, Bank>();
  for (const bank of allBanks) if (bank.accountNumber) banksByAccountNumber.set(bank.accountNumber, bank);

  const votes: { categoryId: number; weight: number }[] = [];
  for (const row of picked) {
    if (row.recurringCategoryId != null) votes.push({ categoryId: row.recurringCategoryId, weight: RULE_WEIGHT });
    const ruled = rules.length ? matchRules(row.description, row.amount, row.direction, row.account, rules, banksByAccountNumber) : null;
    if (ruled != null) votes.push({ categoryId: ruled, weight: RULE_WEIGHT });
  }

  const names = [...new Set(picked.map((r) => resolveDisplayName(r).trim()).filter(Boolean))];
  const patternByKey = new Map<string, string>();
  for (const row of picked) {
    const p = rulePatternOf(row.description);
    if (p && !patternByKey.has(p.toLowerCase())) patternByKey.set(p.toLowerCase(), p);
  }
  const patterns = [...patternByKey.values()];
  const directions = new Set(picked.map((r) => r.direction));
  const direction = directions.size === 1 ? ([...directions][0] === "income" ? "income" : "expense") : null;

  // History: what other transactions at the same merchant, or with the same name, were
  // put in. Each transaction counts once even when it matches both ways.
  const merchantIds = [...new Set(picked.map((r) => r.merchantId).filter((id): id is number => id != null))];
  const conditions = [
    ...(merchantIds.length ? [inArray(transactions.merchantId, merchantIds)] : []),
    ...patterns.map((p) => like(transactions.description, `%${p}%`)),
  ];
  const pickedIds = new Set(picked.map((r) => r.id));
  const sharedMerchantId = merchantIds.length === 1 && picked.every((r) => r.merchantId === merchantIds[0]) ? merchantIds[0] : null;
  const [sharedMerchant] = sharedMerchantId != null ? await db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, sharedMerchantId)) : [];
  const others = conditions.length
    ? (
        await db
          .select({
            id: transactions.id,
            description: transactions.description,
            direction: transactions.direction,
            categoryId: transactions.categoryId,
          })
          .from(transactions)
          .where(or(...conditions))
      ).filter((r) => !pickedIds.has(r.id))
    : [];

  for (const r of others) if (r.categoryId != null) votes.push({ categoryId: r.categoryId, weight: 1 });

  // The rule's "contains" match, same as matchRules: lower-cased substring.
  const lowered = patterns.map((p) => p.toLowerCase());
  const similar = others.filter(
    (r) => (direction == null || r.direction === direction) && lowered.some((p) => r.description.trim().toLowerCase().includes(p)),
  );
  const splitIds = similar.length
    ? new Set(
        (
          await db
            .select({ id: transactionSplits.transactionId })
            .from(transactionSplits)
            .where(inArray(transactionSplits.transactionId, similar.map((r) => r.id)))
        ).map((s) => s.id),
      )
    : new Set<number>();

  return {
    suggested: rankCategorySuggestions(votes, validIds),
    names,
    total: picked.reduce((sum, r) => sum + (r.direction === "expense" ? -r.amount : r.amount), 0),
    patterns,
    direction,
    similarIds: similar.filter((r) => !splitIds.has(r.id)).map((r) => r.id),
    merchantName: sharedMerchant?.name ?? null,
  };
}
