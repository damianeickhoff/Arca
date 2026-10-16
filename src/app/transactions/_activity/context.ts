import type { RecurringItem } from "@/db/schema";

/**
 * What the Activity detail panel needs to put a transaction in context, loaded once by
 * the server page (src/app/transactions/page.tsx) from the existing calculations:
 *   • budgets      — per category, this budget period's budget and spend
 *                    (getBudgetOverview), for the summary card's budget bar;
 *   • budgetPeriod — that period's dates and days left;
 *   • recurring    — the recurring items the visible rows are linked to, for the
 *                    history row and its popup (next charge, last 12 charges).
 */
export interface ActivityContext {
  budgets: Record<number, { budget: number | null; spent: number }>;
  /** The budget period those figures cover, so the panel knows whether a payment counts in it. */
  budgetPeriod?: { from: string; to: string; daysLeft: number };
  recurring: Record<number, RecurringItem>;
}

/** The two link tiles above the list (upcoming bills and needs-a-category). */
export interface ActivityTiles {
  upcoming: { count: number; total: number; until: string } | null;
  needsReview: { count: number; total: number } | null;
}
