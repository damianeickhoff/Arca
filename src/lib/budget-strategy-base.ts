import type { BudgetIncomeSource } from "@/lib/budget-income";
import { toMonthly } from "@/lib/format";

/** What the strategy's amounts are worked out on: the overall budget, or the income. */
export type StrategyBaseSource = "budget" | BudgetIncomeSource;

export interface StrategyBase {
  /** Per month. */
  amount: number;
  source: StrategyBaseSource;
}

/**
 * The amount the Needs / Wants / Savings split divides: the overall budget a month when
 * one is set (a weekly one averaged to a month), since that is what is planned to be
 * spent; without one, the income the budget is planned on (regular salary and benefits,
 * see getBudgetIncome). Pure, so the Budget page and its editors agree.
 */
export function strategyBase(
  budget: { amount: number; period: "weekly" | "monthly" } | null,
  income: { income: number; source: BudgetIncomeSource },
): StrategyBase {
  if (budget && budget.amount > 0) return { amount: budget.period === "weekly" ? toMonthly(budget.amount, "weekly") : budget.amount, source: "budget" };
  return { amount: income.income, source: income.source };
}
