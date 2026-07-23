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
export function matchRecurringItem<T extends RecurringMatcher>(
  description: string,
  amount: number,
  items: T[],
): T | null {
  const desc = description.toLowerCase();
  const abs = Math.abs(amount);
  for (const item of items) {
    if (!item.active || !item.matchPattern) continue;
    if (!desc.includes(item.matchPattern.toLowerCase())) continue;
    if (item.matchAmountMin != null || item.matchAmountMax != null) {
      if (item.matchAmountMin != null && abs < Math.abs(item.matchAmountMin) - 0.01) continue;
      if (item.matchAmountMax != null && abs > Math.abs(item.matchAmountMax) + 0.01) continue;
    } else if (item.matchAmount != null && Math.abs(abs - Math.abs(item.matchAmount)) > 0.01) {
      continue;
    }
    return item;
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
