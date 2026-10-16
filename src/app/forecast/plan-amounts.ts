import type { PlanItem } from "./load-forecast";

// Shared by the server (the plan totals) and the client (Recurring items, the
// override dialog), so both read a month the same way.

/** The usual amount for a month (category budgets can differ per month). */
export function usualFor(item: PlanItem, month: string) {
  return item.defaults?.[month] ?? item.defaultAmount;
}

/** What the plan uses for a month: the override when there is one. */
export function amountFor(item: PlanItem, month: string) {
  return item.overrides[month] ?? usualFor(item, month);
}
