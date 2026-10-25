import { asc, eq, isNotNull } from "drizzle-orm";
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
import { getBudgetRecurringMode, type BudgetRecurringMode } from "@/lib/app-settings";
import { currentFinancialMonth, type FinancialMonthConfig } from "@/lib/date-range";
import { toMonthly } from "@/lib/format";
import { recurringCountsToward } from "@/lib/safe-to-spend";

/** The recurring item types that count as fixed costs in a month's plan. */
export const PLAN_EXPENSE_TYPES = ["bill", "subscription", "debt", "plan"] as const;

/** The variable (budgetable) category types. */
const BUDGET_TYPES = ["nodig", "willen", "sparen"] as const;

export interface FreeToSpendParts {
  /** Recurring income for the month. */
  income: number;
  /** Recurring bills, subscriptions and debt payments the budget doesn't already cover. */
  recurring: number;
  /** Monthly savings contributions: savings goals and recurring savings items. */
  savings: number;
  /** What is budgeted for spending (bills inside it included, see coveredByBudget). */
  budget: number;
}

/**
 * The one definition of a month's "free to spend": recurring income minus the fixed
 * costs outside the budget, the savings contributions and the budget. Shared by the
 * Forecast plan card and the Debts page's extra-payment simulator, so the two never
 * disagree on the formula.
 */
export function freeToSpend(parts: FreeToSpendParts): number {
  return parts.income - parts.recurring - parts.savings - parts.budget;
}

/** A category as the budget sees it: budgetable, and whether a budget sits on it or its group. */
export interface BudgetCategoryInfo {
  /** A variable budget type, and not a savings or income category. */
  variable: boolean;
  /** A category budget on it or on its group. */
  budgeted: boolean;
}

/**
 * Whether a recurring cost is already inside the budget, so free to spend doesn't take it
 * off twice: the rule Plan › Budget counts bills by (recurringCountsToward). An overall
 * budget is everything that may be spent, so it covers every bill in a budgetable or no
 * category (unless recurring bills are excluded from budgets); category budgets only
 * cover the bills in a category, or group, that has one.
 */
export function coveredByBudget(
  category: BudgetCategoryInfo | null,
  budgetSource: "overall" | "categories" | "none",
  mode: BudgetRecurringMode,
): boolean {
  if (budgetSource === "none") return false;
  const hasOverall = budgetSource === "overall";
  if (category == null) return hasOverall && mode !== "exclude";
  if (!category.variable || (!hasOverall && !category.budgeted)) return false;
  return recurringCountsToward(mode, hasOverall, category.budgeted);
}

/** Budget facts per category id, for coveredByBudget. */
export function budgetCategoryInfo(
  cats: readonly { id: number; budgetType: string | null; group: string; parentCategoryId: number | null }[],
  hasTarget: (categoryId: number) => boolean,
): Map<number, BudgetCategoryInfo> {
  return new Map(
    cats.map((c) => [
      c.id,
      {
        variable: (BUDGET_TYPES as readonly string[]).includes(c.budgetType ?? "") && c.group !== "savings" && c.group !== "income",
        budgeted: hasTarget(c.id) || (c.parentCategoryId != null && hasTarget(c.parentCategoryId)),
      },
    ]),
  );
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
  /** Recurring costs inside the budget, so not in `recurring`. */
  covered: number;
  free: number;
}

/**
 * This financial month's plan, read the way the Forecast plan card reads it: active
 * recurring items averaged to a month (one-month overrides win), active savings goals'
 * monthly contributions (overrides win) plus recurring savings items. The budget is the
 * overall budget when one is set (a weekly one averaged to a month), else the sum of the
 * category budgets for the month (month-specific target, else the default, overrides
 * win). Costs the budget covers (coveredByBudget) are part of the budget, not `recurring`.
 */
export async function getMonthlyFreeToSpend(financialMonth: FinancialMonthConfig): Promise<MonthlyFreeToSpend> {
  const month = currentFinancialMonth(financialMonth);
  const [year, monthNumber] = month.split("-").map(Number);

  const [items, itemOverrides, goals, goalOverrides, overallMonthly, allCats, targets, budgetOverrides, mode] = await Promise.all([
    db
      .select({
        id: recurringItems.id,
        type: recurringItems.type,
        amount: recurringItems.amount,
        frequency: recurringItems.frequency,
        categoryId: recurringItems.categoryId,
      })
      .from(recurringItems)
      .where(eq(recurringItems.active, true)),
    db.select().from(prognoseOverrides).where(eq(prognoseOverrides.month, month)),
    db.select({ id: savingsGoals.id, monthlyContribution: savingsGoals.monthlyContribution }).from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(savingsMonthOverrides).where(eq(savingsMonthOverrides.month, month)),
    getOverallMonthlyBudget(),
    db
      .select({ id: categories.id, budgetType: categories.budgetType, group: categories.group, parentCategoryId: categories.parentCategoryId })
      .from(categories),
    db.select().from(budgetTargets).where(isNotNull(budgetTargets.categoryId)),
    db.select().from(variablePrognoseOverrides).where(eq(variablePrognoseOverrides.month, month)),
    getBudgetRecurringMode(),
  ]);

  const defaultTarget = new Map<number, number>();
  const monthTarget = new Map<number, number>();
  for (const row of targets) {
    if (row.categoryId == null) continue;
    if (row.year === 0 && row.month === 0) defaultTarget.set(row.categoryId, row.targetAmount);
    else if (row.year === year && row.month === monthNumber) monthTarget.set(row.categoryId, row.targetAmount);
  }
  const budgetOverride = new Map(budgetOverrides.map((o) => [o.categoryId, o.overrideAmount]));
  const targetFor = (id: number) => budgetOverride.get(id) ?? monthTarget.get(id) ?? defaultTarget.get(id) ?? 0;
  const info = budgetCategoryInfo(allCats, (id) => targetFor(id) > 0);

  let budget = 0;
  let budgetSource: MonthlyFreeToSpend["budgetSource"] = "none";
  if (overallMonthly != null) {
    budget = overallMonthly;
    budgetSource = "overall";
  } else {
    budget = allCats.filter((c) => info.get(c.id)?.variable).reduce((s, c) => s + targetFor(c.id), 0);
    if (budget > 0) budgetSource = "categories";
  }

  const itemOverride = new Map(itemOverrides.map((o) => [o.recurringItemId, o.amount]));
  const itemAmount = (i: (typeof items)[number]) => itemOverride.get(i.id) ?? toMonthly(i.amount, i.frequency);
  const income = items.filter((i) => i.type === "income").reduce((s, i) => s + itemAmount(i), 0);
  let recurring = 0;
  let covered = 0;
  for (const i of items) {
    if (!(PLAN_EXPENSE_TYPES as readonly string[]).includes(i.type)) continue;
    const category = i.categoryId != null ? info.get(i.categoryId) ?? null : null;
    if (coveredByBudget(category, budgetSource, mode)) covered += itemAmount(i);
    else recurring += itemAmount(i);
  }

  const goalOverride = new Map(goalOverrides.map((o) => [o.goalId, o.overrideAmount]));
  const savings =
    goals.reduce((s, g) => s + (goalOverride.get(g.id) ?? g.monthlyContribution ?? 0), 0) +
    items.filter((i) => i.type === "savings").reduce((s, i) => s + itemAmount(i), 0);

  const parts = { income, recurring, savings, budget };
  return { month, ...parts, budgetSource, covered, free: freeToSpend(parts) };
}
