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

/** The cards beside the period hero: upcoming bills and needs-a-category. */
export interface ActivityTiles {
  upcoming: {
    count: number;
    total: number;
    until: string;
    /** The next three, for the Upcoming card when nothing needs a category. */
    next: { id: string; name: string; date: string; amount: number }[];
  } | null;
  needsReview: { count: number; total: number } | null;
}

/**
 * The hero's spending-per-day chart for the financial month, with the bills still
 * scheduled after today as hatched bars.
 */
export interface ActivitySpendChart {
  /** Each bar: its day, what went out, and the bills still due on it. */
  bars: { from: string; spent: number; scheduled: number }[];
  /** The bar holding today, when the period runs past today. */
  todayIndex: number | null;
  /** The bills still scheduled after today, within the period. */
  scheduledTotal: number;
  /** Money out per elapsed day of the period. */
  perDay: number;
  /** The first and last day of the financial month. */
  start: string;
  end: string;
}
