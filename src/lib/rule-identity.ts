import type { CategoryRule } from "@/db/schema";

/** A rule's conditions — everything that decides what it matches, not where it files. */
export type RuleConditions = Pick<
  CategoryRule,
  "namePattern" | "nameWildcard" | "nameWholeWord" | "amount" | "amountMin" | "amountMax" | "direction" | "bankId"
>;

/** The name match as matchRules reads it: a whole-word flag wins over the wildcard flag. */
const matchKind = (r: RuleConditions) => (r.nameWholeWord ? "word" : r.nameWildcard ? "contains" : "exact");
/** Patterns match trimmed and case-insensitively, so "AH " and "ah" are the same pattern. */
const pattern = (r: RuleConditions) => r.namePattern?.trim().toLowerCase() || null;
/** Amounts match by magnitude in whole cents, so 12.5 and -12.50 are the same amount. */
const cents = (n: number | null) => (n == null ? null : Math.round(Math.abs(n) * 100));
const direction = (r: RuleConditions) => (r.direction === "income" || r.direction === "expense" ? r.direction : null);

/**
 * True when two rules have every condition equal — the same pattern and match type, the
 * same amount (exact or range), direction and account — so they match exactly the same
 * transactions and only the first one could ever file anything. "AH" under €15 and "AH"
 * at any amount are different rules.
 */
export function sameRuleConditions(a: RuleConditions, b: RuleConditions): boolean {
  const name = pattern(a);
  return (
    name === pattern(b) &&
    // Without a pattern the match type means nothing.
    (name == null || matchKind(a) === matchKind(b)) &&
    cents(a.amount) === cents(b.amount) &&
    cents(a.amountMin) === cents(b.amountMin) &&
    cents(a.amountMax) === cents(b.amountMax) &&
    direction(a) === direction(b) &&
    (a.bankId ?? null) === (b.bankId ?? null)
  );
}

/**
 * The rule in another category with the same conditions as `rule`, if there is one —
 * saving `rule` into `categoryId` would then move it there. `exceptId` leaves out the
 * rule being edited itself.
 */
export function findRuleInOtherCategory<R extends RuleConditions & { id: number; categoryId: number }>(
  rules: R[],
  rule: RuleConditions,
  categoryId: number,
  exceptId: number | null = null,
): R | null {
  return rules.find((r) => r.id !== exceptId && r.categoryId !== categoryId && sameRuleConditions(r, rule)) ?? null;
}
