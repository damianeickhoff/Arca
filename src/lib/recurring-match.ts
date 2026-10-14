import { db } from "@/db";
import { recurringItems } from "@/db/schema";

// Minimal shape needed to test a transaction against a recurring item.
export type RecurringMatcher = {
  id: number;
  name: string;
  matchPattern: string | null;
  matchWholeWord: boolean;
  matchAmount: number | null;
  matchAmountMin: number | null;
  matchAmountMax: number | null;
  categoryId: number | null;
  friendlyName: string | null;
  active: boolean;
  // Payload rather than matching criteria: these ride along on a match but never affect
  // whether one happens, so callers that only ask "does anything already cover this?"
  // (see detect-recurring.ts) can build a matcher without them.
  /** Incoming money that pays you back rather than real income — matched transactions
   *  get transactions.isReimbursement so income totals ignore them. */
  isReimbursement?: boolean;
  /** The share of a shared bill others pay back; see reimbursedAmountExpr. */
  sharedReimbursedAmount?: number | null;
};

/** |amount| in whole cents. Comparing cents rather than floats is what makes "within a
 *  cent" inclusive: 30.00 − 29.99 is 0.010000000000001 as a float, which used to fail a
 *  "≤ 0.01" check. */
function absCents(amount: number): number {
  return Math.round(Math.abs(amount) * 100);
}

/** "netflix" matches "NETFLIX.COM" as a whole word but not "netflixer" — the same
 *  boundary rule the category rules use (see matchRules in lib/apply-rules.ts), written
 *  with lookarounds rather than \b so patterns ending in punctuation still work. */
function containsWholeWord(haystack: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(haystack);
}

/**
 * First active recurring item whose matchPattern is contained in the description
 * (case-insensitive) and whose amount satisfies the item's amount constraint:
 *   - range mode (matchAmountMin/Max set): |amount| must fall within [min, max] (±1 cent);
 *   - exact mode (matchAmount set): |amount| must equal it within a cent;
 *   - otherwise no amount constraint.
 * Range mode takes precedence over exact when both are somehow set. Returns null when nothing
 * matches. Amount is compared on the absolute value so the expense/income sign doesn't matter.
 */
// Amount/pattern constraint shared by matchRecurringItem below and the bill/debt
// "was this paid?" auto-match checks (bill-status.ts, debt-recurring-paid.ts) so a bill
// is judged matched by exactly one rule everywhere.
type AmountConstraint = Pick<RecurringMatcher, "matchPattern" | "matchAmount" | "matchAmountMin" | "matchAmountMax"> &
  // Optional so callers that predate the whole-word option (and rows loaded without the
  // column) keep the old "contains" behaviour instead of failing to type-check.
  Partial<Pick<RecurringMatcher, "matchWholeWord">>;

/**
 * Whether a single transaction matches a recurring item's pattern + amount constraint:
 *   - range mode (matchAmountMin/Max set): |amount| must fall within [min, max] (±1 cent);
 *   - exact mode (matchAmount set): |amount| must equal it within a cent;
 *   - otherwise pattern-only.
 * Range mode takes precedence over exact when both are set. Amount is compared on the
 * absolute value so the expense/income sign doesn't matter.
 */
export function transactionMatchesRecurringItem(
  description: string,
  amount: number,
  item: AmountConstraint,
): boolean {
  if (!item.matchPattern) return false;
  const desc = description.toLowerCase();
  const pattern = item.matchPattern.toLowerCase().trim();
  if (!pattern) return false;
  if (item.matchWholeWord ? !containsWholeWord(desc, pattern) : !desc.includes(pattern)) return false;
  const abs = absCents(amount);
  if (item.matchAmountMin != null || item.matchAmountMax != null) {
    if (item.matchAmountMin != null && abs < absCents(item.matchAmountMin) - 1) return false;
    if (item.matchAmountMax != null && abs > absCents(item.matchAmountMax) + 1) return false;
  } else if (item.matchAmount != null && Math.abs(abs - absCents(item.matchAmount)) > 1) {
    return false;
  }
  return true;
}

/**
 * First active recurring item whose matchPattern + amount constraint the transaction
 * satisfies (see transactionMatchesRecurringItem). Returns null when nothing matches.
 */
export function matchRecurringItem<T extends RecurringMatcher>(
  description: string,
  amount: number,
  items: T[],
): T | null {
  for (const item of items) {
    if (!item.active) continue;
    if (transactionMatchesRecurringItem(description, amount, item)) return item;
  }
  return null;
}

/** Loads every recurring item as a matcher (used by import + apply-rules). */
export async function loadRecurringMatchers(): Promise<RecurringMatcher[]> {
  return db
    .select({
      id: recurringItems.id,
      name: recurringItems.name,
      matchPattern: recurringItems.matchPattern,
      matchWholeWord: recurringItems.matchWholeWord,
      matchAmount: recurringItems.matchAmount,
      matchAmountMin: recurringItems.matchAmountMin,
      matchAmountMax: recurringItems.matchAmountMax,
      categoryId: recurringItems.categoryId,
      friendlyName: recurringItems.friendlyName,
      active: recurringItems.active,
      isReimbursement: recurringItems.isReimbursement,
      sharedReimbursedAmount: recurringItems.sharedReimbursedAmount,
    })
    .from(recurringItems);
}
