import type { BudgetRecurringMode } from "@/lib/app-settings";
import type { BudgetOverview } from "@/lib/budget-overview";
import { daysInclusive, shiftDate } from "@/lib/date-range";

export type SafeToSpendPace = "onPace" | "fast" | "over";

export interface SafeToSpend {
  /** The budget for this period (overall, or the sum of category budgets). */
  target: number;
  /** Spent so far against that budget. */
  spent: number;
  /** Bills still due this period that will count toward the budget once paid. */
  reserved: number;
  /** target − spent − reserved. Negative when over. */
  amount: number;
  /** What's left per day, today included; 0 when nothing is left. */
  perDay: number;
  /** The day the period resets (YYYY-MM-DD). */
  resetsOn: string;
  /** How far through the period today is, 0–1. */
  elapsed: number;
  /** Days in the budget period. */
  totalDays: number;
  pace: SafeToSpendPace;
}

export interface UpcomingBill {
  categoryId: number | null;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  isIncome: boolean;
}

/**
 * Safe to spend has one definition: the budget for this period, minus what is spent
 * against it, minus the bills still due that will count toward it once paid. A bill
 * counts when its category is a variable category inside the budget and the
 * budget-and-recurring mode lets recurring bills count there — the same rule
 * getBudgetOverview applies to spend — so paying it later moves the money from
 * "bills" to "spent" without changing the total. Null without a budget.
 */
export function safeToSpend(
  overview: Pick<BudgetOverview, "budget" | "allocated" | "totalSpent" | "budgetedSpent" | "from" | "to" | "categories">,
  bills: readonly UpcomingBill[],
  recurringMode: BudgetRecurringMode,
  today: string,
): SafeToSpend | null {
  const hasOverall = (overview.budget?.amount ?? 0) > 0;
  const target = hasOverall ? overview.budget!.amount : overview.allocated;
  if (target <= 0) return null;
  const spent = hasOverall ? overview.totalSpent : overview.budgetedSpent;

  const reserved = bills
    .filter((b) => !b.isIncome && b.dueDate >= today && b.dueDate <= overview.to)
    .filter((b) => countsTowardBudget(overview.categories.find((c) => c.categoryId === b.categoryId), hasOverall, true, recurringMode))
    .reduce((s, b) => s + b.amount, 0);

  const amount = target - spent - reserved;
  const totalDays = Math.max(1, daysInclusive(overview.from, overview.to));
  const daysLeft = Math.max(1, daysInclusive(today < overview.from ? overview.from : today, overview.to));
  const elapsed = (totalDays - daysLeft) / totalDays;
  const used = (spent + reserved) / target;

  return {
    target,
    spent,
    reserved,
    amount,
    perDay: Math.max(0, amount) / daysLeft,
    resetsOn: shiftDate(overview.to, 1),
    elapsed,
    totalDays,
    pace: amount < 0 ? "over" : used > elapsed + 0.05 ? "fast" : "onPace",
  };
}

/** Whether a recurring bill's spend counts toward a category in the budget. */
function countsTowardBudget(
  cat: { budget: number | null } | undefined,
  hasOverall: boolean,
  recurring: boolean,
  recurringMode: BudgetRecurringMode,
) {
  if (!cat) return false; // not a variable category: never part of the budget
  if (!hasOverall && cat.budget == null) return false; // outside the category budgets
  if (!recurring) return true;
  return recurringMode === "always" || (recurringMode === "budgeted" && cat.budget != null);
}

export interface SpendEntry {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  categoryId: number | null;
  /** Matched to a recurring bill or subscription. */
  recurring: boolean;
}

/**
 * Spend against the budget, cumulative per day from the start of the period up to and
 * including today (or the period's last day), for the hero's pace line. Uses the same
 * counting rules as safeToSpend's bills.
 */
export function budgetSpendByDay(
  entries: readonly SpendEntry[],
  overview: Pick<BudgetOverview, "budget" | "from" | "to" | "categories">,
  recurringMode: BudgetRecurringMode,
  today: string,
): number[] {
  const hasOverall = (overview.budget?.amount ?? 0) > 0;
  const last = today < overview.to ? today : overview.to;
  const days = daysInclusive(overview.from, last);
  const daily = new Array<number>(days).fill(0);

  for (const e of entries) {
    if (e.date < overview.from || e.date > last) continue;
    const cat = overview.categories.find((c) => c.categoryId === e.categoryId);
    if (!countsTowardBudget(cat, hasOverall, e.recurring, recurringMode)) continue;
    daily[daysInclusive(overview.from, e.date) - 1] += e.amount;
  }

  let running = 0;
  return daily.map((d) => (running += d));
}
