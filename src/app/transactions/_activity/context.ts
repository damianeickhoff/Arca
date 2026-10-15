import type { RecurringItem } from "@/db/schema";

/**
 * What the Activity detail panel needs to put a transaction in context, loaded once by
 * the server page (src/app/transactions/page.tsx) from the existing calculations:
 *   • budgets        — per category, this budget period's budget and spend
 *                      (getBudgetOverview), for the Budget impact tile and the
 *                      category-context bar;
 *   • merchantSpend  — per category, this financial month's expense split by merchant,
 *                      largest first, for the category-context bar;
 *   • recurring      — the recurring items the visible rows are linked to, for the
 *                      Next charge tile and the Last 12 charges section.
 */
export interface ActivityContext {
  budgets: Record<number, { budget: number | null; spent: number }>;
  merchantSpend: Record<number, { name: string; amount: number }[]>;
  recurring: Record<number, RecurringItem>;
}

/** The two link tiles above the list (upcoming bills and needs-a-category). */
export interface ActivityTiles {
  upcoming: { count: number; total: number; until: string } | null;
  needsReview: { count: number; total: number } | null;
}
