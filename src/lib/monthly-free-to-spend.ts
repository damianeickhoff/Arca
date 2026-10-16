import { asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  budgetTargets,
  budgets,
  categories,
  prognoseOverrides,
  recurringItems,
  savingsGoals,
  savingsMonthOverrides,
  variablePrognoseOverrides,
} from "@/db/schema";
import { currentFinancialMonth, type FinancialMonthConfig } from "@/lib/date-range";
import { toMonthly } from "@/lib/format";

/** The recurring item types that count as fixed costs in a month's plan. */
export const PLAN_EXPENSE_TYPES = ["bill", "subscription", "debt", "plan"] as const;

/** The variable (budgetable) category types. */
const BUDGET_TYPES = ["nodig", "willen", "sparen"] as const;

export interface FreeToSpendParts {
  /** Recurring income for the month. */
  income: number;
  /** Recurring bills, subscriptions and debt payments. */
  recurring: number;
  /** Monthly savings contributions. */
  savings: number;
  /** What is budgeted for day-to-day spending. */
  budget: number;
}

/**
 * The one definition of a month's "free to spend": recurring income minus the fixed
 * costs, the savings contributions and the budget. Shared by the Forecast plan card and
 * the Debts page's extra-payment simulator, so the two never disagree on the formula.
 */
export function freeToSpend(parts: FreeToSpendParts): number {
  return parts.income - parts.recurring - parts.savings - parts.budget;
}

/**
 * The active overall budget as a monthly amount (a weekly one averaged to a month), or
 * null when there is none. When set it is "the budget" for free to spend; only without
 * one do the category budgets add up to it.
 */
export async function getOverallMonthlyBudget(): Promise<number | null> {
  const [row] = await db.select().from(budgets).where(eq(budgets.active, true)).orderBy(asc(budgets.id)).limit(1);
  if (!row || row.amount <= 0) return null;
  return row.period === "weekly" ? toMonthly(row.amount, "weekly") : row.amount;
}

export interface MonthlyFreeToSpend extends FreeToSpendParts {
  /** The financial month (YYYY-MM) the figures are for. */
  month: string;
  /** Where `budget` came from: the overall budget, the sum of category budgets, or nothing set. */
  budgetSource: "overall" | "categories" | "none";
  free: number;
}

/**
 * This financial month's plan, read the way the Forecast plan card reads it: active
 * recurring items averaged to a month (one-month overrides win), active savings goals'
 * monthly contributions (overrides win). The budget is the overall budget when one is
 * set (a weekly one averaged to a month), else the sum of the category budgets for the
 * month (month-specific target, else the default, overrides win).
 */
export async function getMonthlyFreeToSpend(financialMonth: FinancialMonthConfig): Promise<MonthlyFreeToSpend> {
  const month = currentFinancialMonth(financialMonth);
  const [year, monthNumber] = month.split("-").map(Number);

  const [items, itemOverrides, goals, goalOverrides, overallMonthly, budgetCats, targets, budgetOverrides] = await Promise.all([
    db
      .select({ id: recurringItems.id, type: recurringItems.type, amount: recurringItems.amount, frequency: recurringItems.frequency })
      .from(recurringItems)
      .where(eq(recurringItems.active, true)),
    db.select().from(prognoseOverrides).where(eq(prognoseOverrides.month, month)),
    db.select({ id: savingsGoals.id, monthlyContribution: savingsGoals.monthlyContribution }).from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(savingsMonthOverrides).where(eq(savingsMonthOverrides.month, month)),
    getOverallMonthlyBudget(),
    db.select({ id: categories.id }).from(categories).where(inArray(categories.budgetType, [...BUDGET_TYPES])),
    db.select().from(budgetTargets).where(isNotNull(budgetTargets.categoryId)),
    db.select().from(variablePrognoseOverrides).where(eq(variablePrognoseOverrides.month, month)),
  ]);

  const itemOverride = new Map(itemOverrides.map((o) => [o.recurringItemId, o.amount]));
  const itemAmount = (i: (typeof items)[number]) => itemOverride.get(i.id) ?? toMonthly(i.amount, i.frequency);
  const income = items.filter((i) => i.type === "income").reduce((s, i) => s + itemAmount(i), 0);
  const recurring = items
    .filter((i) => (PLAN_EXPENSE_TYPES as readonly string[]).includes(i.type))
    .reduce((s, i) => s + itemAmount(i), 0);

  const goalOverride = new Map(goalOverrides.map((o) => [o.goalId, o.overrideAmount]));
  const savings = goals.reduce((s, g) => s + (goalOverride.get(g.id) ?? g.monthlyContribution ?? 0), 0);

  let budget = 0;
  let budgetSource: MonthlyFreeToSpend["budgetSource"] = "none";
  if (overallMonthly != null) {
    budget = overallMonthly;
    budgetSource = "overall";
  } else {
    const defaultTarget = new Map<number, number>();
    const monthTarget = new Map<number, number>();
    for (const row of targets) {
      if (row.categoryId == null) continue;
      if (row.year === 0 && row.month === 0) defaultTarget.set(row.categoryId, row.targetAmount);
      else if (row.year === year && row.month === monthNumber) monthTarget.set(row.categoryId, row.targetAmount);
    }
    const budgetOverride = new Map(budgetOverrides.map((o) => [o.categoryId, o.overrideAmount]));
    budget = budgetCats.reduce(
      (s, c) => s + (budgetOverride.get(c.id) ?? monthTarget.get(c.id) ?? defaultTarget.get(c.id) ?? 0),
      0,
    );
    if (budget > 0) budgetSource = "categories";
  }

  const parts = { income, recurring, savings, budget };
  return { month, ...parts, budgetSource, free: freeToSpend(parts) };
}
