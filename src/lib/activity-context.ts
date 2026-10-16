import { db } from "@/db";
import { recurringItems } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getBudgetOverview } from "@/lib/budget-overview";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { ActivityContext } from "@/app/transactions/_activity/context";

/**
 * What the transaction detail panel shows around one transaction: every category's
 * budget and spend in the current budget period (and that period's dates), and the
 * recurring items the given transactions are linked to. Activity builds it for the
 * rows on screen; the other places that open the panel fetch it from
 * /api/activity-context for the one transaction they open.
 */
export async function getActivityContext(financialMonth: FinancialMonthConfig, recurringIds: number[]): Promise<ActivityContext> {
  const ids = [...new Set(recurringIds)];
  const [budgetOverview, recurringRows] = await Promise.all([
    getBudgetOverview(financialMonth),
    ids.length > 0 ? db.select().from(recurringItems).where(inArray(recurringItems.id, ids)) : Promise.resolve([]),
  ]);

  return {
    budgets: Object.fromEntries(budgetOverview.categories.map((c) => [c.categoryId, { budget: c.budget, spent: c.spent }])),
    budgetPeriod: { from: budgetOverview.from, to: budgetOverview.to, daysLeft: budgetOverview.daysLeft },
    recurring: Object.fromEntries(recurringRows.map((r) => [r.id, r])),
  };
}
