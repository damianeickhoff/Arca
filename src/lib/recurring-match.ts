import { db } from "@/db";
import { recurringItems } from "@/db/schema";

// Minimal shape needed to test a transaction against a recurring item.
export type RecurringMatcher = {
  id: number;
  name: string;
  matchPattern: string | null;
  matchAmount: number | null;
  matchAmountMin: number | null;
  matchAmountMax: number | null;
  categoryId: number | null;
  friendlyName: string | null;
  active: boolean;
};

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
type AmountConstraint = Pick<RecurringMatcher, "matchPattern" | "matchAmount" | "matchAmountMin" | "matchAmountMax">;

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
  if (!description.toLowerCase().includes(item.matchPattern.toLowerCase())) return false;
  const abs = Math.abs(amount);
  if (item.matchAmountMin != null || item.matchAmountMax != null) {
    if (item.matchAmountMin != null && abs < Math.abs(item.matchAmountMin) - 0.01) return false;
    if (item.matchAmountMax != null && abs > Math.abs(item.matchAmountMax) + 0.01) return false;
  } else if (item.matchAmount != null && Math.abs(abs - Math.abs(item.matchAmount)) > 0.01) {
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
      matchAmount: recurringItems.matchAmount,
      matchAmountMin: recurringItems.matchAmountMin,
      matchAmountMax: recurringItems.matchAmountMax,
      categoryId: recurringItems.categoryId,
      friendlyName: recurringItems.friendlyName,
      active: recurringItems.active,
    })
    .from(recurringItems);
}
